require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const {pool,query,one,setting,saveSetting} = require('./db');
const providers = require('./providers');
const app = express();
const port = Number(process.env.PORT||10000);
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) { console.error('SESSION_SECRET must be set to at least 32 characters.'); if(process.env.NODE_ENV==='production') process.exit(1); }
app.set('trust proxy', 1); app.set('view engine','ejs'); app.set('views',__dirname);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com"],imgSrc:["'self'","data:","https:"],scriptSrc:["'self'","'unsafe-inline'"],connectSrc:["'self'"]}}}));
app.use(express.urlencoded({extended:false,limit:'100kb'})); app.use(express.json({limit:'100kb'})); app.use(express.static(__dirname+'/public',{maxAge:process.env.NODE_ENV==='production'?'1d':0}));
// Design files are served before sessions so they never create session rows.
const path=require('path');
app.get('/assets/style.css',(req,res)=>res.sendFile(path.join(__dirname,'style.css')));
app.get('/assets/msh-extra.css',(req,res)=>res.sendFile(path.join(__dirname,'msh-extra.css')));
app.get('/assets/app.js',(req,res)=>res.sendFile(path.join(__dirname,'browser.js')));
const MySQLStore=MySQLStoreFactory(session);
app.use(session({name:'msh.sid',secret:process.env.SESSION_SECRET||'development-only-change-me-please-123456',resave:false,saveUninitialized:false,store:new MySQLStore({createDatabaseTable:true, schema:{tableName:'web_sessions',columnNames:{session_id:'session_id',expires:'expires',data:'data'}},...{host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME},...(String(process.env.DB_SSL||'').toLowerCase()==='true'?{ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}}:{})}),cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*14}}));
app.use((req,res,next)=>{res.locals.user=req.session.user||null;res.locals.path=req.path;res.locals.csrf=req.session.csrf||(req.session.csrf=crypto.randomBytes(24).toString('hex'));res.locals.flash=req.session.flash||null;delete req.session.flash;res.locals.money=n=>`₦${Number(n||0).toLocaleString('en-NG',{minimumFractionDigits:2,maximumFractionDigits:2})}`;res.locals.rate=async()=>Number(await setting('usd_ngn_rate','1500'));next();});
// Original MAR design assets (kept in the repo root) and the six service pages.
const FEATURES={
  'buy-number-1':{type:'numbers',provider:'grizzly',title:'Buy Number 1',icon:'☎'},
  'buy-number-2':{type:'numbers',provider:'nova',title:'Buy Number 2',icon:'☎'},
  'smm-boost-1':{type:'smm',provider:'smm',title:'SMM Boost 1',icon:'◎'},
  'smm-boost-2':{type:'smm',provider:'nova',title:'SMM Boost 2',icon:'◎'},
  'social-log-1':{type:'logs',provider:'sl',title:'Social Log 1',icon:'▤'},
  'social-log-2':{type:'logs',provider:'nova',title:'Social Log 2',icon:'▤'}
};
app.use((req,res,next)=>{res.locals.features=FEATURES;res.locals.feature=null;res.locals.slug='';next();});
async function loadCatalogue(type,provider){
  const args=[type];let extra='';
  if(provider){extra=' AND provider_key=?';args.push(provider);}
  const rows=await query('SELECT id,service_type,provider_key,provider_service_id,name,price,provider_cost,provider_currency,category,min_quantity,max_quantity,enabled FROM service_overrides WHERE service_type=? AND enabled=1'+extra+' ORDER BY category,name LIMIT 1000',args).catch(()=>[]);
  const fx=Number(await setting('usd_ngn_rate','1500'))||1500;
  for(const r of rows){let fallback=Number(r.provider_cost);const currency=String(r.provider_currency||'').toUpperCase();if(!Number.isFinite(fallback)||fallback<=0)fallback=0;else if(['USD','US DOLLAR','US DOLLARS','$'].includes(currency)||(!currency&&['grizzly','smm'].includes(r.provider_key)))fallback*=fx;r.display_price=Number(r.price)>0?Number(r.price):fallback;r.price_source=Number(r.price)>0?'admin':'provider';}
  return rows;
}
// ---- Receipt upload (kept in the database, never on Render's temporary disk) ----
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:4*1024*1024,files:1,fields:15}});
function receiptUpload(req,res,next){upload.single('receipt')(req,res,err=>{if(err){flash(req,'error',err.code==='LIMIT_FILE_SIZE'?'The receipt is too large. Maximum size is 4 MB.':'The receipt could not be read. Please try again.');return res.redirect('/fund');}next();});}
function detectReceipt(buf){
  if(!buf||buf.length<12)return null;
  if(buf[0]===0xFF&&buf[1]===0xD8&&buf[2]===0xFF)return{mime:'image/jpeg',ext:'jpg'};
  if(buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])))return{mime:'image/png',ext:'png'};
  if(buf.subarray(0,4).toString('latin1')==='RIFF'&&buf.subarray(8,12).toString('latin1')==='WEBP')return{mime:'image/webp',ext:'webp'};
  if(buf.subarray(0,4).toString('latin1')==='%PDF')return{mime:'application/pdf',ext:'pdf'};
  return null;
}
// ---- Telegram receiver for payment notifications (bot token and chat id are set in Admin > Payments & contact) ----
async function telegramSend(text,file,kind,name){
  const token=await setting('telegram_bot_token',''),chat=await setting('telegram_chat_id','');
  if(!token||!chat)return false;
  const base=`https://api.telegram.org/bot${token}/`;let resp;
  if(file){
    const isPhoto=kind.mime==='image/jpeg'||kind.mime==='image/png';
    const fd=new FormData();fd.append('chat_id',chat);fd.append('caption',text.slice(0,1000));
    fd.append(isPhoto?'photo':'document',new Blob([file],{type:kind.mime}),name);
    resp=await fetch(base+(isPhoto?'sendPhoto':'sendDocument'),{method:'POST',body:fd,signal:AbortSignal.timeout(20000)});
  }else{
    resp=await fetch(base+'sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text:text.slice(0,4000)}),signal:AbortSignal.timeout(15000)});
  }
  if(!resp.ok)throw new Error('Telegram refused the message (HTTP '+resp.status+'). Check the bot token and chat ID, and make sure the bot was started or added to the chat.');
  return true;
}
function safeContactUrl(v){v=String(v||'').trim();if(/^https:\/\/\S+$/i.test(v)||/^mailto:\S+$/i.test(v)||/^tel:\+?[0-9 ()-]+$/i.test(v))return v.slice(0,500);throw new Error('A contact link must start with https://, mailto: or tel:.');}
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false,message:'Too many sign-in attempts. Please wait and try again.'});
function flash(req,type,message){req.session.flash={type,message};}
function csrf(req,res,next){if(!req.body||req.body.csrf!==req.session.csrf)return res.status(403).render('error',{title:'Request expired',message:'This form expired or failed its security check. Reload the page and try again.'});next();}
function auth(req,res,next){if(!req.session.user){flash(req,'warning','Please sign in to continue.');return res.redirect('/login');}next();}
function admin(req,res,next){if(!req.session.user||req.session.user.role!=='admin')return res.status(403).render('error',{title:'Admin access required',message:'Sign in with an administrator account to access this page.'});next();}
async function audit(req,action,entity,ref='',details=''){const uid=req.session.user?.id||null;const ip=crypto.createHash('sha256').update(String(req.ip||'')).digest('hex');await query('INSERT INTO audit_logs(admin_user_id,action,entity_type,entity_ref,details,ip_hash) VALUES(?,?,?,?,?,?)',[uid,action,entity,ref,String(details).slice(0,500),ip]).catch(()=>{});}
async function renderPage(req,res,title,body,extra={}){res.render('page',{title,body,...extra});}
app.get('/healthz',async(req,res)=>{try{await query('SELECT 1');res.json({ok:true,service:'mar-social-hub-node',database:'connected',time:new Date().toISOString()});}catch(e){res.status(503).json({ok:false,database:'unavailable'});}});
app.get('/',async(req,res)=>{const stats=await one("SELECT COUNT(*) users FROM users WHERE status='active'").catch(()=>({users:0}));await renderPage(req,res,'Home','home',{stats});});
app.get('/register',(req,res)=>renderPage(req,res,'Create account','register'));
app.post('/register',loginLimiter,csrf,async(req,res)=>{try{const name=String(req.body.name||'').trim(),username=String(req.body.username||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');if(name.length<2||username.length<3||!/^[a-zA-Z0-9_.-]+$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||password.length<10)throw new Error('Enter a valid name, username, email, and password of at least 10 characters.');const hash=await bcrypt.hash(password,12);const result=await query("INSERT INTO users(name,username,email,password_hash) VALUES(?,?,?,?)",[name,username,email,hash]);req.session.regenerate(err=>{if(err)return res.status(500).send('Could not create a secure session.');req.session.user={id:result.insertId,name,username,email,role:'customer',balance:0};req.session.csrf=crypto.randomBytes(24).toString('hex');req.session.flash={type:'success',message:'Welcome to Mar Social Hub.'};res.redirect('/dashboard');});}catch(e){flash(req,'error',e.code==='ER_DUP_ENTRY'?'That username or email is already registered.':e.message);res.redirect('/register');}});
app.get('/login',(req,res)=>renderPage(req,res,'Sign in','login'));
app.post('/login',loginLimiter,csrf,async(req,res)=>{try{const identity=String(req.body.identity||'').trim();const user=await one('SELECT id,name,username,email,password_hash,balance,role,status FROM users WHERE email=? OR username=? LIMIT 1',[identity.toLowerCase(),identity]);if(!user||user.status!=='active'||!(await bcrypt.compare(String(req.body.password||''),user.password_hash))){await query("INSERT INTO audit_logs(action,entity_type,details,ip_hash) VALUES('login_failed','user','Invalid credentials',?)",[crypto.createHash('sha256').update(String(req.ip)).digest('hex')]).catch(()=>{});throw new Error('Incorrect login details or account unavailable.');}req.session.regenerate(err=>{if(err)return res.status(500).send('Could not create a secure session.');req.session.user={id:user.id,name:user.name,username:user.username,email:user.email,role:user.role,balance:user.balance};req.session.csrf=crypto.randomBytes(24).toString('hex');req.session.flash={type:'success',message:'You are signed in.'};res.redirect(user.role==='admin'?'/admin':'/dashboard');});}catch(e){flash(req,'error',e.message);res.redirect('/login');}});
app.post('/logout',csrf,(req,res)=>req.session.destroy(()=>{res.clearCookie('msh.sid');res.redirect('/');}));
app.get('/dashboard',auth,async(req,res)=>{const u=await one('SELECT id,name,username,email,balance,role FROM users WHERE id=?',[req.session.user.id]);const orders=await query('SELECT id,service_type,service_name,amount,status,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 8',[u.id]);const tx=await query('SELECT kind,amount,description,created_at FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 6',[u.id]);await renderPage(req,res,'Dashboard','dashboard',{account:u,orders,transactions:tx});});
app.get('/buy',(req,res)=>res.redirect('/service/buy-number-1'));
app.get('/smm',(req,res)=>res.redirect('/service/smm-boost-1'));
app.get('/number-history',auth,(req,res)=>res.redirect('/history/buy-number-1'));
app.get('/active-numbers',auth,(req,res)=>res.redirect('/orders?status=processing'));
app.get('/smm-history',auth,(req,res)=>res.redirect('/history/smm-boost-1'));
app.get('/social-history',auth,(req,res)=>res.redirect('/history/social-log-1'));
app.get('/marketplace',(req,res)=>res.redirect('/services?type=logs'));
app.get('/website',(req,res)=>res.redirect('/services?type=logs'));
app.get('/purchases',auth,(req,res)=>res.redirect('/orders'));
app.get('/deposits',auth,(req,res)=>res.redirect('/fund'));
app.get('/admin-settings',(req,res)=>res.redirect('/admin/settings'));
app.get('/admin-services',(req,res)=>res.redirect('/admin/services'));
app.get('/admin-users',(req,res)=>res.redirect('/admin/users'));
app.get('/admin-deposits',(req,res)=>res.redirect('/admin/deposits'));
app.get('/admin-orders',(req,res)=>res.redirect('/admin/orders'));
app.get('/admin-messages',(req,res)=>res.redirect('/admin/messages'));
app.get('/admin-audit',(req,res)=>res.redirect('/admin/audit'));
app.get('/services',async(req,res,next)=>{try{const type=String(req.query.type||'smm');const chosen=['numbers','smm','logs'].includes(type)?type:'smm';const rows=await loadCatalogue(chosen,null);await renderPage(req,res,'Services','services',{services:rows,type:chosen});}catch(e){next(e);}});
app.get('/service/:slug',async(req,res,next)=>{try{const f=FEATURES[req.params.slug];if(!f)return next();const rows=await loadCatalogue(f.type,f.provider);res.locals.feature=f;res.locals.slug=req.params.slug;await renderPage(req,res,f.title,'services',{services:rows,type:f.type});}catch(e){next(e);}});
app.get('/history/:slug',auth,async(req,res,next)=>{try{const f=FEATURES[req.params.slug];if(!f)return next();const orders=await query('SELECT * FROM orders WHERE user_id=? AND service_type=? AND provider_key=? ORDER BY id DESC LIMIT 300',[req.session.user.id,f.type,f.provider]);res.locals.feature=f;res.locals.slug=req.params.slug;await renderPage(req,res,f.title+' history','orders',{orders});}catch(e){next(e);}});
app.get('/orders',auth,async(req,res)=>{const orders=await query('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 300',[req.session.user.id]);await renderPage(req,res,'My orders','orders',{orders});});
app.get('/transactions',auth,async(req,res)=>{const rows=await query('SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 300',[req.session.user.id]);await renderPage(req,res,'Wallet transactions','transactions',{transactions:rows});});
app.get('/fund',auth,async(req,res,next)=>{try{const rows=await query('SELECT id,amount,method,reference,status,created_at,(receipt_data IS NOT NULL) AS has_receipt FROM deposits WHERE user_id=? ORDER BY id DESC LIMIT 100',[req.session.user.id]);const methods=await query('SELECT id,title,details FROM payment_methods WHERE enabled=1 ORDER BY sort_order,id').catch(()=>[]);await renderPage(req,res,'Fund wallet','fund',{deposits:rows,methods,paymentDetails:await setting('payment_details','')});}catch(e){next(e);}});
app.post('/fund',auth,receiptUpload,csrf,async(req,res)=>{try{
  const amount=Number(req.body.amount);
  if(!Number.isFinite(amount)||amount<100||amount>100000000)throw new Error('Enter an amount between ₦100 and ₦100,000,000.');
  const file=req.file,kind=file?detectReceipt(file.buffer):null;
  if(!file||!kind)throw new Error('Upload your payment receipt as a JPG, PNG, WEBP or PDF file, 4 MB or smaller.');
  const methods=await query('SELECT title FROM payment_methods WHERE enabled=1').catch(()=>[]);
  let method=String(req.body.method||'').trim().slice(0,60)||'Bank Transfer';
  if(methods.length&&!methods.some(x=>x.title===method))throw new Error('Choose one of the listed payment methods.');
  const reference='DEP-'+crypto.randomBytes(8).toString('hex').toUpperCase();
  const sender=String(req.body.sender_name||'').slice(0,160),payref=String(req.body.payment_reference||'').slice(0,160),note=String(req.body.note||'').slice(0,1000);
  await query('INSERT INTO deposits(user_id,amount,method,reference,receipt_note,payment_sender_name,payment_reference,receipt_original_name,receipt_mime,receipt_data) VALUES(?,?,?,?,?,?,?,?,?,?)',[req.session.user.id,amount,method,reference,note,sender,payref,String(file.originalname||('receipt.'+kind.ext)).slice(0,255),kind.mime,file.buffer]);
  const text=['New payment to review: '+reference,'Customer: '+req.session.user.name+' ('+req.session.user.email+')','Amount: ₦'+amount.toLocaleString('en-NG'),'Method: '+method,sender?'Sender name: '+sender:'',payref?'Payment reference: '+payref:'',note?'Note: '+note:'','Approve or decline it in the website admin, Deposit approvals.'].filter(Boolean).join('\n');
  telegramSend(text,file.buffer,kind,'receipt-'+reference+'.'+kind.ext).catch(e=>console.error('Telegram notification failed:',e.message));
  flash(req,'success','Payment '+reference+' submitted with your receipt. It stays pending until the admin approves or declines it.');
}catch(e){flash(req,'error',e.message);}res.redirect('/fund');});
app.get('/receipt/:id',auth,async(req,res,next)=>{try{const d=await one('SELECT user_id,receipt_mime,receipt_original_name,receipt_data FROM deposits WHERE id=?',[req.params.id]);if(!d||!d.receipt_data||(req.session.user.role!=='admin'&&Number(d.user_id)!==Number(req.session.user.id)))return next();const isPdf=d.receipt_mime==='application/pdf';res.set({'Content-Type':d.receipt_mime||'application/octet-stream','Content-Disposition':(isPdf?'attachment':'inline')+'; filename="receipt-'+req.params.id+(isPdf?'.pdf':'')+'"','Cache-Control':'private, no-store'});res.send(d.receipt_data);}catch(e){next(e);}});
app.get('/profile',auth,async(req,res)=>{const u=await one('SELECT name,username,email,created_at FROM users WHERE id=?',[req.session.user.id]);await renderPage(req,res,'Profile','profile',{account:u});});
app.get('/support',auth,async(req,res)=>{const messages=await query('SELECT * FROM support_messages WHERE user_id=? ORDER BY id ASC LIMIT 300',[req.session.user.id]);await renderPage(req,res,'Support','support',{messages,supportUrl:await setting('support_url',''),contacts:await query('SELECT label,url FROM contact_modes WHERE enabled=1 ORDER BY sort_order,id').catch(()=>[])});});
app.post('/support',auth,csrf,async(req,res)=>{const message=String(req.body.message||'').trim();if(!message||message.length>3000){flash(req,'error','Message must be between 1 and 3000 characters.');}else{await query("INSERT INTO support_messages(user_id,sender_role,message) VALUES(?,'customer',?)",[req.session.user.id,message]);flash(req,'success','Message sent to support.');}res.redirect('/support');});
app.get('/alerts',auth,async(req,res)=>{const rows=await query('SELECT * FROM notifications WHERE user_id IS NULL OR user_id=? ORDER BY id DESC LIMIT 100',[req.session.user.id]);await renderPage(req,res,'Announcements','alerts',{notifications:rows});});
app.get('/admin',admin,async(req,res)=>{const counts={users:(await one('SELECT COUNT(*) n FROM users')).n,orders:(await one('SELECT COUNT(*) n FROM orders')).n,pending:(await one("SELECT COUNT(*) n FROM deposits WHERE status='pending'")).n,services:(await one('SELECT COUNT(*) n FROM service_overrides')).n};await renderPage(req,res,'Admin dashboard','admin',{counts});});
app.get('/admin/settings',admin,async(req,res)=>{const keys=['usd_ngn_rate','payment_details','payment_whatsapp_number','support_method','support_url','support_label','support_enabled'];const settings={};for(const k of keys)settings[k]=await setting(k,k==='usd_ngn_rate'?'1500':'');for(const p of ['grizzly','nova','smm','sl']){settings[p+'_api_url']=await setting(p+'_api_url',providers.defaults[p]);settings[p+'_has_key']=Boolean(await setting(p+'_api_key'));settings['health_'+p]=await setting('health_'+p,'Not tested yet');settings['provider_balance_'+p]=await setting('provider_balance_'+p,'Not checked yet');}await renderPage(req,res,'Website settings','admin-settings',{settings});});
app.post('/admin/settings',admin,csrf,async(req,res)=>{try{const rate=Number(req.body.usd_ngn_rate);if(!Number.isFinite(rate)||rate<1||rate>10000000)throw new Error('Exchange rate must be between 1 and 10,000,000.');await saveSetting('usd_ngn_rate',rate);for(const k of ['payment_details','payment_whatsapp_number','support_method','support_url','support_label','support_enabled'])await saveSetting(k,String(req.body[k]||'').slice(0,k==='payment_details'?5000:500));for(const p of ['grizzly','nova','smm','sl']){const key=String(req.body[p+'_api_key']||'').trim(),url=String(req.body[p+'_api_url']||'').trim();if(key)await saveSetting(p+'_api_key',key);if(url){const parsed=new URL(url);if(parsed.protocol!=='https:')throw new Error(`${p} API URL must use HTTPS.`);await saveSetting(p+'_api_url',url);}}await audit(req,'settings_updated','settings','website','Updated provider and website settings');flash(req,'success','Settings saved. Empty API key fields keep their previously saved keys.');}catch(e){flash(req,'error',e.message);}res.redirect('/admin/settings');});
app.get('/admin/services',admin,async(req,res)=>{const type=String(req.query.type||'numbers');const rows=await query('SELECT * FROM service_overrides WHERE service_type=? ORDER BY provider_key,category,name LIMIT 1000',[type]);await renderPage(req,res,'Service pricing','admin-services',{services:rows,type});});
app.post('/admin/services/:id/price',admin,csrf,async(req,res)=>{try{const price=Number(req.body.price);if(!Number.isFinite(price)||price<0||price>1000000000)throw new Error('Enter a valid customer price in NGN.');await query('UPDATE service_overrides SET price=?,enabled=?,markup_enabled=1 WHERE id=?',[price,req.body.enabled==='1'?1:0,req.params.id]);await audit(req,'service_price_updated','service',req.params.id,`price=${price}`);flash(req,'success','Service price saved.');}catch(e){flash(req,'error',e.message);}res.redirect('/admin/services?type='+encodeURIComponent(req.body.type||'numbers'));});
app.post('/admin/providers/:provider/sync',admin,csrf,async(req,res)=>{try{const provider=req.params.provider;if(!['grizzly','nova','smm','sl'].includes(provider))throw new Error('Unknown provider.');const count=await providers.syncCatalogue(provider,req.body.type||null);await saveSetting('health_'+provider,'Last sync succeeded at '+new Date().toISOString());await audit(req,'catalogue_sync','provider',provider,`Imported/updated ${count} catalogue rows`);flash(req,'success',`${provider} catalogue sync finished: ${count} rows imported or updated. Review customer NGN prices before enabling purchases.`);}catch(e){await saveSetting('health_'+req.params.provider,'Sync failed at '+new Date().toISOString()).catch(()=>{});flash(req,'error',e.message);}res.redirect('/admin/settings');});
app.post('/admin/providers/:provider/test',admin,csrf,async(req,res)=>{try{const result=await providers.balance(req.params.provider);const value=JSON.stringify(result).slice(0,500);await saveSetting('provider_balance_'+req.params.provider,value);await saveSetting('health_'+req.params.provider,'Connection succeeded at '+new Date().toISOString());flash(req,'success','Provider read/balance request succeeded. This does not prove that purchases or refunds work.');}catch(e){await saveSetting('health_'+req.params.provider,'Connection failed: '+e.message.slice(0,300));flash(req,'error',e.message);}res.redirect('/admin/settings');});
app.get('/admin/users',admin,async(req,res)=>{const users=await query('SELECT id,name,username,email,balance,role,status,created_at FROM users ORDER BY id DESC LIMIT 500');await renderPage(req,res,'Manage users','admin-users',{users});});
app.post('/admin/users/:id/status',admin,csrf,async(req,res)=>{const status=req.body.status==='blocked'?'blocked':'active';await query('UPDATE users SET status=? WHERE id=?',[status,req.params.id]);await audit(req,'user_status_updated','user',req.params.id,status);flash(req,'success','User status updated.');res.redirect('/admin/users');});
app.get('/admin/deposits',admin,async(req,res)=>{const rows=await query('SELECT d.id,d.user_id,d.amount,d.method,d.reference,d.receipt_note,d.payment_sender_name,d.payment_reference,d.status,d.created_at,(d.receipt_data IS NOT NULL) AS has_receipt,u.name,u.email FROM deposits d JOIN users u ON u.id=d.user_id ORDER BY d.id DESC LIMIT 500');await renderPage(req,res,'Deposit approvals','admin-deposits',{deposits:rows});});
app.post('/admin/deposits/:id/review',admin,csrf,async(req,res)=>{const conn=await pool.getConnection();try{await conn.beginTransaction();const [dr]=await conn.execute('SELECT id,user_id,amount,status,reference FROM deposits WHERE id=? FOR UPDATE',[req.params.id]);const d=dr[0];if(!d||d.status!=='pending')throw new Error('This deposit has already been reviewed or does not exist.');const approve=req.body.status==='approved';await conn.execute('UPDATE deposits SET status=?,reviewed_at=NOW() WHERE id=?',[approve?'approved':'rejected',d.id]);if(approve){const [ur]=await conn.execute('SELECT balance FROM users WHERE id=? FOR UPDATE',[d.user_id]);if(!ur[0])throw new Error('Customer no longer exists.');const bal=Number(ur[0].balance)+Number(d.amount);await conn.execute('UPDATE users SET balance=? WHERE id=?',[bal,d.user_id]);await conn.execute('INSERT INTO transactions(user_id,kind,amount,balance_after,reference,description) VALUES(?,?,?,?,?,?)',[d.user_id,'deposit',d.amount,bal,d.reference,'Admin-approved wallet deposit']);}await conn.commit();await audit(req,'deposit_reviewed','deposit',d.id,approve?'approved':'rejected');await query('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)',[d.user_id,approve?'Payment approved':'Payment declined',approve?('Your payment '+d.reference+' was approved and your wallet has been credited.'):('Your payment '+d.reference+' was declined. Contact support if you think this is a mistake.')]).catch(()=>{});flash(req,'success',approve?'Deposit approved and wallet credited once.':'Deposit rejected; wallet was not credited.');}catch(e){await conn.rollback();flash(req,'error',e.message);}finally{conn.release();}res.redirect('/admin/deposits');});
app.get('/admin/orders',admin,async(req,res)=>{const orders=await query('SELECT o.*,u.name,u.email FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 500');await renderPage(req,res,'All orders','admin-orders',{orders});});
app.get('/admin/messages',admin,async(req,res)=>{const rows=await query('SELECT sm.*,u.name,u.email FROM support_messages sm JOIN users u ON u.id=sm.user_id ORDER BY sm.id DESC LIMIT 300');await renderPage(req,res,'Support inbox','admin-messages',{messages:rows});});
app.post('/admin/messages/:id/reply',admin,csrf,async(req,res)=>{const original=await one('SELECT user_id FROM support_messages WHERE id=?',[req.params.id]);const message=String(req.body.message||'').trim();if(original&&message&&message.length<=3000){await query("INSERT INTO support_messages(user_id,sender_role,message) VALUES(?,'admin',?)",[original.user_id,message]);flash(req,'success','Reply sent.');}else flash(req,'error','Could not send reply.');res.redirect('/admin/messages');});
app.post('/admin/broadcast',admin,csrf,async(req,res)=>{const title=String(req.body.title||'').trim().slice(0,180),message=String(req.body.message||'').trim();if(!title||!message){flash(req,'error','Title and message are required.');}else{await query('INSERT INTO notifications(user_id,title,message) VALUES(NULL,?,?)',[title,message]);flash(req,'success','Announcement published.');}res.redirect('/admin');});
app.get('/admin/audit',admin,async(req,res)=>{const rows=await query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500');await renderPage(req,res,'Audit log','admin-audit',{logs:rows});});
// API endpoints expose only the signed-in user's own data; provider credentials are never returned.
app.get('/api/me',auth,async(req,res)=>{const u=await one('SELECT id,name,username,email,balance,role FROM users WHERE id=?',[req.session.user.id]);res.json(u);});
app.get('/api/services',async(req,res)=>{const type=['numbers','smm','logs'].includes(req.query.type)?req.query.type:'smm';const rows=await query('SELECT id,service_type,provider_key,provider_service_id,name,price,category,min_quantity,max_quantity,enabled FROM service_overrides WHERE service_type=? AND enabled=1 ORDER BY category,name LIMIT 1000',[type]);res.json(rows);});

// ---- Admin: add or remove wallet money ----
app.post('/admin/users/:id/wallet',admin,csrf,async(req,res)=>{const conn=await pool.getConnection();try{
  const amount=Number(req.body.amount),credit=req.body.direction!=='debit',note=String(req.body.note||'').trim().slice(0,150);
  if(!Number.isFinite(amount)||amount<=0||amount>100000000)throw new Error('Enter an amount between ₦0.01 and ₦100,000,000.');
  await conn.beginTransaction();
  const [ur]=await conn.execute('SELECT balance FROM users WHERE id=? FOR UPDATE',[req.params.id]);
  if(!ur[0])throw new Error('Customer not found.');
  const bal=Number(ur[0].balance)+(credit?amount:-amount);
  if(bal<0)throw new Error('This would make the wallet negative. The balance is ₦'+Number(ur[0].balance).toLocaleString('en-NG')+'.');
  await conn.execute('UPDATE users SET balance=? WHERE id=?',[bal,req.params.id]);
  const ref='ADJ-'+crypto.randomBytes(6).toString('hex').toUpperCase();
  await conn.execute('INSERT INTO transactions(user_id,kind,amount,balance_after,reference,description) VALUES(?,?,?,?,?,?)',[req.params.id,credit?'admin_credit':'admin_debit',amount,bal,ref,(credit?'Wallet credited by admin':'Wallet debited by admin')+(note?': '+note:'')]);
  await conn.commit();
  await audit(req,credit?'wallet_credit':'wallet_debit','user',req.params.id,'amount='+amount+' ref='+ref);
  await query('INSERT INTO notifications(user_id,title,message) VALUES(?,?,?)',[req.params.id,credit?'Wallet credited':'Wallet debited','₦'+amount.toLocaleString('en-NG')+(credit?' was added to':' was removed from')+' your wallet.'+(note?' Note: '+note:'')]).catch(()=>{});
  flash(req,'success',(credit?'Added ':'Removed ')+'₦'+amount.toLocaleString('en-NG')+(credit?' to':' from')+' the wallet. New balance: ₦'+bal.toLocaleString('en-NG')+'.');
}catch(e){try{await conn.rollback();}catch(_){}flash(req,'error',e.message);}finally{conn.release();}res.redirect('/admin/users');});

// ---- Admin: payment methods, contact modes and the Telegram receiver ----
app.get('/admin/channels',admin,async(req,res,next)=>{try{
  const methods=await query('SELECT * FROM payment_methods ORDER BY sort_order,id');
  const contacts=await query('SELECT * FROM contact_modes ORDER BY sort_order,id');
  const telegram={chat:await setting('telegram_chat_id',''),hasToken:Boolean(await setting('telegram_bot_token',''))};
  await renderPage(req,res,'Payments and contact','admin-channels',{methods,contacts,telegram});
}catch(e){next(e);}});
function channelRoute(fn,okMessage){return async(req,res)=>{try{await fn(req);flash(req,'success',okMessage);}catch(e){flash(req,'error',e.message);}res.redirect('/admin/channels');};}
const cleanText=(v,max,label)=>{v=String(v||'').trim();if(!v)throw new Error(label+' is required.');return v.slice(0,max);};
const cleanSort=v=>{const n=parseInt(v,10);return Number.isFinite(n)?Math.max(0,Math.min(n,9999)):0;};
app.post('/admin/payment-methods',admin,csrf,channelRoute(async req=>{await query('INSERT INTO payment_methods(title,details,sort_order,enabled) VALUES(?,?,?,1)',[cleanText(req.body.title,60,'Name'),cleanText(req.body.details,2000,'Payment details'),cleanSort(req.body.sort_order)]);await audit(req,'payment_method_added','payment_method','',String(req.body.title||'').slice(0,80));},'Payment method added.'));
app.post('/admin/payment-methods/:id',admin,csrf,channelRoute(async req=>{await query('UPDATE payment_methods SET title=?,details=?,sort_order=?,enabled=? WHERE id=?',[cleanText(req.body.title,60,'Name'),cleanText(req.body.details,2000,'Payment details'),cleanSort(req.body.sort_order),req.body.enabled==='1'?1:0,req.params.id]);await audit(req,'payment_method_updated','payment_method',req.params.id,'');},'Payment method saved.'));
app.post('/admin/payment-methods/:id/delete',admin,csrf,channelRoute(async req=>{await query('DELETE FROM payment_methods WHERE id=?',[req.params.id]);await audit(req,'payment_method_deleted','payment_method',req.params.id,'');},'Payment method deleted.'));
app.post('/admin/contact-modes',admin,csrf,channelRoute(async req=>{await query('INSERT INTO contact_modes(label,url,sort_order,enabled) VALUES(?,?,?,1)',[cleanText(req.body.label,60,'Label'),safeContactUrl(req.body.url),cleanSort(req.body.sort_order)]);await audit(req,'contact_mode_added','contact_mode','',String(req.body.label||'').slice(0,80));},'Contact option added.'));
app.post('/admin/contact-modes/:id',admin,csrf,channelRoute(async req=>{await query('UPDATE contact_modes SET label=?,url=?,sort_order=?,enabled=? WHERE id=?',[cleanText(req.body.label,60,'Label'),safeContactUrl(req.body.url),cleanSort(req.body.sort_order),req.body.enabled==='1'?1:0,req.params.id]);await audit(req,'contact_mode_updated','contact_mode',req.params.id,'');},'Contact option saved.'));
app.post('/admin/contact-modes/:id/delete',admin,csrf,channelRoute(async req=>{await query('DELETE FROM contact_modes WHERE id=?',[req.params.id]);await audit(req,'contact_mode_deleted','contact_mode',req.params.id,'');},'Contact option deleted.'));
app.post('/admin/telegram',admin,csrf,channelRoute(async req=>{
  const chat=String(req.body.chat_id||'').trim(),token=String(req.body.bot_token||'').trim();
  if(chat&&!/^(-?\d{5,20}|@[A-Za-z0-9_]{4,})$/.test(chat))throw new Error('Chat ID looks wrong. Use the number from your bot chat, or @channelname.');
  if(token&&!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token))throw new Error('Bot token looks wrong. Copy it exactly from BotFather.');
  await saveSetting('telegram_chat_id',chat);
  if(req.body.clear_token==='1')await saveSetting('telegram_bot_token','');else if(token)await saveSetting('telegram_bot_token',token);
  await audit(req,'telegram_updated','settings','telegram','Telegram receiver settings saved');
},'Telegram settings saved.'));
app.post('/admin/telegram/test',admin,csrf,async(req,res)=>{try{const ok=await telegramSend('Test message from Mar Social Hub. Payment receipts will arrive in this chat.');flash(req,ok?'success':'error',ok?'Test message sent. Check your Telegram chat.':'Save the bot token and chat ID first.');}catch(e){flash(req,'error',e.message);}res.redirect('/admin/channels');});

// ---- Customer: change password ----
app.post('/profile/password',auth,loginLimiter,csrf,async(req,res)=>{try{
  const cur=String(req.body.current||''),pw=String(req.body.password||''),conf=String(req.body.confirm||'');
  if(pw.length<10)throw new Error('The new password must be at least 10 characters.');
  if(pw!==conf)throw new Error('The new passwords do not match.');
  const u=await one('SELECT password_hash FROM users WHERE id=?',[req.session.user.id]);
  if(!u||!(await bcrypt.compare(cur,u.password_hash)))throw new Error('Your current password is not correct.');
  await query('UPDATE users SET password_hash=? WHERE id=?',[await bcrypt.hash(pw,12),req.session.user.id]);
  flash(req,'success','Password changed.');
}catch(e){flash(req,'error',e.message);}res.redirect('/profile');});

app.use((req,res)=>res.status(404).render('error',{title:'Page not found',message:'The page you requested does not exist.'}));
app.use((err,req,res,next)=>{console.error('Request failed:',err.message);if(res.headersSent)return next(err);res.status(500).render('error',{title:'Something went wrong',message:process.env.NODE_ENV==='production'?'The request could not be completed. Please try again.':err.message});});
(async()=>{try{await query('SELECT 1');
  const total=await one('SELECT COUNT(*) n FROM users');
  if(Number(total.n)===0 && process.env.SETUP_ADMIN_EMAIL && process.env.SETUP_ADMIN_USERNAME && process.env.SETUP_ADMIN_PASSWORD && process.env.SETUP_ADMIN_PASSWORD.length>=12){
    const email=process.env.SETUP_ADMIN_EMAIL.trim().toLowerCase(), username=process.env.SETUP_ADMIN_USERNAME.trim();
    const hash=await bcrypt.hash(process.env.SETUP_ADMIN_PASSWORD,12);
    await query("INSERT INTO users(name,username,email,password_hash,role,status) VALUES(?,?,?,?, 'admin','active')",['Mar Social Hub Admin',username,email,hash]);
    console.log('Initial admin account created from SETUP_ADMIN_* environment variables. Remove those bootstrap variables after successful sign-in.');
  }
  console.log('MySQL connection verified.');app.listen(port,'0.0.0.0',()=>console.log(`Mar Social Hub Node listening on ${port}`));}catch(e){console.error('Database connection or schema initialization failed. Run npm run migrate and verify Render environment variables/database network access.',e.message);process.exit(1);}})();
