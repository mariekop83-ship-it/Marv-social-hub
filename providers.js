const { setting, query, one } = require('./db');
const defaults = {
  grizzly: process.env.GRIZZLY_API_URL || 'https://api.grizzlysms.com/stubs/handler_api.php',
  nova: process.env.NOVA_API_URL || 'https://www.novasolution.ng/api/v1',
  smm: process.env.SMM_API_URL || 'https://reallysimplesocial.com/api/v2',
  sl: process.env.SOCIAL_LOG_API_URL || 'https://rakibsocials.com/api/v1'
};
function normalizeRows(value) {
  if (!value || typeof value !== 'object') return [];
  for (const key of ['services','products','results','items','data','result','catalog','catalogue']) {
    if (value[key] && typeof value[key] === 'object') { const nested = normalizeRows(value[key]); if (nested.length) return nested; }
  }
  if (Array.isArray(value)) return value.filter(x => x && typeof x === 'object');
  return Object.entries(value).map(([key,row]) => row && typeof row === 'object' ? ({ id: row.id ?? row.service_id ?? row.product_id ?? key, ...row }) : ({id:key,service:key,name:String(row)}));
}
function text(row, keys, fallback='') { for (const k of keys) if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]); return fallback; }
function cost(row) { for (const k of ['price','cost','rate','amount','price_per_unit','pricePerUnit','provider_price']) { const n=Number(row[k]); if (Number.isFinite(n)&&n>=0) return n; } return null; }
async function request(provider, method, route='', data={}, jsonBody=null, idempotencyKey=null) {
  const key = await setting(`${provider}_api_key`);
  if (!key) throw new Error(`${provider} API key is not configured in Admin → Website Settings.`);
  const configured = await setting(`${provider}_api_url`, defaults[provider]);
  if (!configured) throw new Error(`No API URL configured for ${provider}.`);
  const base = configured.replace(/\/+$/,'');
  const url = provider==='grizzly' ? new URL(base) : new URL(base + '/' + String(route||'').replace(/^\/+/,''));
  const headers = {Accept:'application/json'};
  let body;
  if (provider==='grizzly') data = {api_key:key,...data};
  if (provider==='nova' || provider==='sl') headers.Authorization = `Bearer ${key}`;
  if (provider==='nova' && idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (method==='GET') {
    for (const [k,v] of Object.entries(data||{})) if (v!==undefined&&v!==null) url.searchParams.set(k,String(v));
  } else {
    if (provider==='nova' || (provider==='sl' && jsonBody!==null)) { headers['Content-Type']='application/json'; body=JSON.stringify(jsonBody ?? data); }
    else { headers['Content-Type']='application/x-www-form-urlencoded'; body=new URLSearchParams(Object.entries(data||{}).map(([k,v])=>[k,String(v)])).toString(); }
  }
  const controller = new AbortController(); const timer=setTimeout(()=>controller.abort(),25000);
  let response, raw;
  try { response=await fetch(url,{method,headers,body,signal:controller.signal,redirect:'error'}); raw=await response.text(); }
  catch (e) { throw new Error(`Provider network outcome could not be confirmed: ${e.name==='AbortError'?'request timed out':e.message}`); }
  finally { clearTimeout(timer); }
  let parsed; try { parsed=JSON.parse(raw); } catch { if(provider==='grizzly' && response.ok) parsed={_raw:raw.trim()}; else throw new Error(`Provider returned an unreadable response (HTTP ${response.status}).`); }
  if (!response.ok) { const err=new Error(`Provider HTTP ${response.status}: ${parsed.message||parsed.error||'request rejected'}`); err.status=response.status; err.ambiguous=response.status>=500||response.status===429; throw err; }
  return parsed;
}
async function syncCatalogue(provider, type=null) {
  const types = provider==='nova' ? ['numbers','smm','logs'] : provider==='grizzly' ? ['numbers'] : provider==='smm' ? ['smm'] : ['logs'];
  const wanted = type ? [type] : types; let count=0;
  for (const t of wanted) {
    let rows=[];
    if (provider==='grizzly') {
      const d=await request('grizzly','GET','',{action:'getServicesList'});
      if (d._raw) throw new Error('Grizzly returned non-JSON catalogue data. Verify API URL and key.');
      rows=normalizeRows(d);
      rows=rows.map(r=>({...r,id:text(r,['code','service','service_id','id']),name:text(r,['name','title','service_name','code','id'])}));
    } else if (provider==='nova') {
      const route={numbers:'/catalog/numbers',smm:'/catalog/smm',logs:'/catalog/logs'}[t];
      for(let page=1;page<=30;page++){const batch=normalizeRows(await request('nova','GET',route,{scope:'global',page,per_page:100}));rows.push(...batch);if(batch.length<100)break;}
    } else if (provider==='smm') rows=normalizeRows(await request('smm','POST','',{key:await setting('smm_api_key'),action:'services'}));
    else { for(let page=1;page<=30;page++){const batch=normalizeRows(await request('sl','GET','/products',{page,per_page:100}));rows.push(...batch);if(batch.length<100)break;} }
    for(const r of rows){
      const id=text(r,['service_id','serviceId','product_id','productId','id','code','service']); if(!id) continue;
      const name=text(r,['name','title','service_name','product_name','service','description'],id);
      const providerCost=cost(r); const currency=text(r,['currency','price_currency','cost_currency'],provider==='grizzly'||provider==='smm'?'USD':'');
      const category=text(r,['category','category_name','platform','type'],t);
      const min=Math.max(1,Number(r.min||r.min_quantity||r.minQuantity||1)||1); const max=Math.max(min,Number(r.max||r.max_quantity||r.maxQuantity||10000000)||10000000);
      await query(`INSERT INTO service_overrides(service_type,provider_key,provider_service_id,name,price,provider_cost,provider_currency,category,min_quantity,max_quantity,enabled,markup_enabled)
        VALUES(?,?,?,?,0,?,?,?,?,?,1,1) ON DUPLICATE KEY UPDATE name=VALUES(name),provider_cost=VALUES(provider_cost),provider_currency=VALUES(provider_currency),category=VALUES(category),min_quantity=VALUES(min_quantity),max_quantity=VALUES(max_quantity)`,[t,provider,id,name,providerCost,currency,category,min,max]); count++;
    }
  }
  return count;
}
async function balance(provider) {
  if(provider==='grizzly') { const d=await request(provider,'GET','',{action:'getBalance'}); if(d._raw){const m=d._raw.match(/ACCESS_BALANCE:([0-9]+(?:\.[0-9]+)?)/);if(m)return {balance:Number(m[1]),currency:'USD'};} return d; }
  if(provider==='nova') return request(provider,'GET','/balance');
  if(provider==='smm') return request(provider,'POST','',{key:await setting('smm_api_key'),action:'balance'});
  if(provider==='sl') return request(provider,'GET','/balance');
  throw new Error('Unknown provider');
}
module.exports={request,syncCatalogue,balance,normalizeRows,defaults,text,cost};
