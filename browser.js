// Shared MAR loading experience for page entry, internal navigation and form actions.
// Keep the support shortcut attached to the viewport, outside scrolling/layout containers.
const supportShortcut=document.querySelector('.support-float');
if(supportShortcut) document.body.appendChild(supportShortcut);
const loader=document.querySelector('.loader');
let loaderFallback=null;
function showMarLoader(message){
  if(!loader) return;
  const caption=loader.querySelector('.loader-caption');
  if(caption && message) caption.textContent=message;
  loader.classList.remove('hidden');
  loader.setAttribute('aria-hidden','false');
  document.documentElement.classList.add('mar-is-loading');
  if(loaderFallback) clearTimeout(loaderFallback);
  // Fail-safe: never trap customers behind an endless overlay.
  loaderFallback=setTimeout(hideMarLoader,10000);
}
function hideMarLoader(){
  if(!loader) return;
  loader.classList.add('hidden');
  loader.setAttribute('aria-hidden','true');
  document.documentElement.classList.remove('mar-is-loading');
  if(loaderFallback){clearTimeout(loaderFallback);loaderFallback=null;}
}
window.addEventListener('load',()=>setTimeout(hideMarLoader,420));
window.addEventListener('pageshow',()=>setTimeout(hideMarLoader,180));
// Safety fallback also covers slow or blocked resources.
loaderFallback=setTimeout(hideMarLoader,10000);
// Admin pricing must remain immediately interactive; provider/network calls on that screen can otherwise make the transition feel stuck.
const currentPage=(new URLSearchParams(window.location.search).get('page')||'').toLowerCase();
if(currentPage==='admin-services') hideMarLoader();
// Show the brand animation before leaving for another page inside this website.
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(!link || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if(link.target==='_blank' || link.hasAttribute('download') || link.dataset.noLoader!==undefined) return;
  let destination; try{destination=new URL(link.href,window.location.href);}catch(_){return;}
  if(destination.origin!==window.location.origin || destination.href===window.location.href || link.getAttribute('href')==='#' || link.getAttribute('href').startsWith('javascript:')) return;
  if((destination.searchParams.get('page')||'').toLowerCase()==='admin-services') return;
  showMarLoader('Taking you to the next page…');
},{capture:true});
// All standard form submissions get a clear loading state, including checkout and admin saves.
document.querySelectorAll('form').forEach(form=>form.addEventListener('submit',event=>{
  if(event.defaultPrevented) return;
  if(currentPage==='admin-services'){const s=event.submitter;if(s&&s.dataset.confirm&&!confirm(s.dataset.confirm)){event.preventDefault();return;}return;}
  if(typeof form.reportValidity==='function' && !form.reportValidity()) return;
  const submitter=event.submitter;
  if(submitter && submitter.dataset.confirm && !confirm(submitter.dataset.confirm)){event.preventDefault();return;}
  showMarLoader('Processing securely…');
  if(submitter && !submitter.dataset.confirm){
    submitter.dataset.originalText=submitter.dataset.originalText||submitter.innerHTML;
    submitter.innerHTML='<span class="mini-spin" aria-hidden="true"></span> Please wait…';
    submitter.disabled=true;
    setTimeout(()=>{submitter.disabled=false;submitter.innerHTML=submitter.dataset.originalText||'Submit';},10000);
  }
}));
const side=document.querySelector('.sidebar'),shade=document.querySelector('.mobile-shade'),hamb=document.querySelector('.hamb');
let mobileMenuScrollY=0;
function setMobileMenu(open){
  if(open && !side?.classList.contains('open')){
    mobileMenuScrollY=window.scrollY||document.documentElement.scrollTop||0;
    document.body.style.top=`-${mobileMenuScrollY}px`;
  }
  side?.classList.toggle('open',open);shade?.classList.toggle('show',open);
  document.body.classList.toggle('mobile-menu-open',open);
  if(hamb)hamb.setAttribute('aria-expanded',open?'true':'false');
  if(!open){
    document.body.style.top='';
    window.scrollTo(0,mobileMenuScrollY);
  }
}
hamb?.setAttribute('aria-expanded','false');
hamb?.addEventListener('click',()=>setMobileMenu(!side?.classList.contains('open')));
shade?.addEventListener('click',()=>setMobileMenu(false));
// The page behind the drawer is fixed while open; only the drawer's bounded viewport can scroll.
side?.querySelectorAll('a[href]').forEach(link=>link.addEventListener('click',()=>setMobileMenu(false)));
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&side?.classList.contains('open'))setMobileMenu(false)});



// Searchable catalogues: customers can find countries, services, categories, ports and products without endless scrolling.
(function installCatalogueSearch(){
  const makeSearch = (placeholder, className='catalogue-search') => {
    const wrap=document.createElement('div'); wrap.className=className+'-wrap';
    const input=document.createElement('input'); input.type='search'; input.className=className;
    input.placeholder=placeholder; input.setAttribute('aria-label',placeholder); input.autocomplete='off';
    wrap.appendChild(input); return {wrap,input};
  };

  // Add an inline search control to larger dropdowns (country, service, platform/category).
  document.querySelectorAll('.field select').forEach(select=>{
    const options=[...select.options].filter(o=>o.value!=='' && !o.disabled);
    if(options.length<5 || select.dataset.searchReady) return;
    select.dataset.searchReady='1';
    const {wrap,input}=makeSearch(select.name==='country'?'Search countries…':(select.name==='service'?'Search services…':'Search options…'),'select-search');
    select.parentElement.insertBefore(wrap,select);
    input.addEventListener('input',()=>{
      const term=input.value.trim().toLocaleLowerCase();
      [...select.options].forEach((option,index)=>{
        if(option.value===''){option.hidden=false;return;}
        option.hidden=!!term && !option.textContent.toLocaleLowerCase().includes(term);
      });
      const selected=select.selectedOptions[0];
      if(selected && selected.hidden) select.value='';
    });
  });

  // Filter service/product/port cards live, keeping purchase forms and pricing untouched.
  document.querySelectorAll('.product-grid').forEach((grid,idx)=>{
    const cards=[...grid.querySelectorAll('.product-card')];
    if(cards.length<2 || grid.dataset.searchReady) return;
    grid.dataset.searchReady='1';
    const page=(new URLSearchParams(window.location.search).get('page')||'').toLowerCase();
    let hint='Search services, categories, or products…';
    if(page.startsWith('buy')) hint='Search ports or service details…';
    else if(page.includes('log')) hint='Search Social Log platform or service…';
    else if(page.startsWith('smm')) hint='Search SMM platform or service…';
    else if(page==='marketplace'||page==='website') hint='Search products…';
    const {wrap,input}=makeSearch(hint);
    const count=document.createElement('div'); count.className='catalogue-search-count muted'; count.setAttribute('aria-live','polite');
    grid.parentElement.insertBefore(wrap,grid); grid.parentElement.insertBefore(count,grid);
    const apply=()=>{
      const term=input.value.trim().toLocaleLowerCase(); let shown=0;
      cards.forEach(card=>{const match=!term||card.textContent.toLocaleLowerCase().includes(term);card.hidden=!match;if(match)shown++;});
      count.textContent=term?`${shown} of ${cards.length} items match your search`:'';
      let empty=grid.parentElement.querySelector(':scope > .catalogue-no-results');
      if(!empty){empty=document.createElement('div');empty.className='empty catalogue-no-results';empty.textContent='No matching items. Try another search.';grid.parentElement.insertBefore(empty,grid.nextSibling);}
      empty.hidden=shown!==0;
    };
    input.addEventListener('input',apply);
  });

  // Search order/history/admin tables by any visible column.
  document.querySelectorAll('.table-wrap table').forEach(table=>{
    const rows=[...table.querySelectorAll('tbody tr')];
    if(rows.length<6 || table.dataset.searchReady) return;
    table.dataset.searchReady='1';
    const {wrap,input}=makeSearch('Search this list…','table-search');
    const parent=table.closest('.table-wrap'); parent.parentElement.insertBefore(wrap,parent);
    const count=document.createElement('div'); count.className='catalogue-search-count muted'; count.setAttribute('aria-live','polite'); parent.parentElement.insertBefore(count,parent);
    input.addEventListener('input',()=>{const term=input.value.trim().toLocaleLowerCase();let shown=0;rows.forEach(row=>{const match=!term||row.textContent.toLocaleLowerCase().includes(term);row.hidden=!match;if(match)shown++;});count.textContent=term?`${shown} of ${rows.length} rows match your search`:'';});
  });
})();


// Number history helpers: copy phone/OTP and show a live 20-minute expiry countdown.
document.addEventListener('click',async event=>{
  const button=event.target.closest('.copy-value');
  if(!button)return;
  const value=button.dataset.copy||'';
  if(!value)return;
  try{
    if(navigator.clipboard&&window.isSecureContext) await navigator.clipboard.writeText(value);
    else {const temp=document.createElement('textarea');temp.value=value;temp.style.position='fixed';temp.style.opacity='0';document.body.appendChild(temp);temp.select();document.execCommand('copy');temp.remove();}
    const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1400);
  }catch(_){button.textContent='Select and copy';}
});
function updateNumberCountdowns(){
  document.querySelectorAll('.countdown[data-expiry]').forEach(node=>{
    const raw=(node.dataset.expiry||'').replace(' ','T');
    const end=Date.parse(raw);
    if(!Number.isFinite(end)){node.textContent='Expiry time unavailable';return;}
    const left=Math.max(0,Math.floor((end-Date.now())/1000));
    if(left<=0){node.textContent='Expiry reached · checking provider';return;}
    const m=Math.floor(left/60),s=left%60;
    node.textContent=`Time remaining: ${m}:${String(s).padStart(2,'0')}`;
  });
}
updateNumberCountdowns();setInterval(updateNumberCountdowns,1000);

// Run provider catalogue sync as small, sequential requests instead of one long PHP request.
// This is especially important on shared/free hosting and for Nova's three catalogues.
document.querySelectorAll('form[data-provider-sync]').forEach(form=>{
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const button=form.querySelector('button[type="submit"]');
    const status=form.querySelector('.sync-progress');
    const base=new FormData(form);
    const provider=String(base.get('provider')||'');
    const types=provider==='nova'?['numbers','smm','logs']:(provider==='smm'?['smm']:(provider==='sl'?['logs']:['numbers']));
    if(!button||!status)return;
    button.disabled=true;
    const oldLabel=button.textContent;
    let totalSynced=0;
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    try{
      for(let ti=0;ti<types.length;ti++){
        const type=types[ti];
        let page=1;
        while(true){
          status.textContent=`Syncing ${type}: page ${page}${provider==='nova'?' · '+(ti+1)+' of 3 catalogues':''}…`;
          let result=null,lastError=null;
          for(let attempt=0;attempt<3;attempt++){
            try{
              const body=new FormData();body.set('csrf',String(base.get('csrf')||''));body.set('action','provider_sync_step');body.set('provider',provider);body.set('service_type',type);body.set('sync_page',String(page));
              const response=await fetch('index.php?page=admin-settings',{method:'POST',body,credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}});
              result=await response.json();
              if(!response.ok||!result.ok)throw new Error(result.error||'The provider did not complete this batch.');
              lastError=null;break;
            }catch(err){lastError=err;if(attempt<2)await pause(1000*(attempt+1));}
          }
          if(lastError)throw lastError;
          totalSynced+=Number(result.synced||0);
          status.textContent=`${type}: saved ${totalSynced} records so far…`;
          if(!result.has_more)break;
          page++;
          if(page>50)throw new Error('Safety limit reached after 50 pages. Some provider results may require another sync.');
          await pause(180);
        }
      }
      status.textContent=`Completed successfully. ${totalSynced} records saved. Refresh Service Pricing to view the updated catalogue.`;
      button.textContent='Sync complete';
    }catch(err){
      status.textContent=`Sync stopped: ${err&&err.message?err.message:'temporary provider or hosting error'}. Successfully saved batches were kept; press Sync catalogue again to retry.`;
      button.textContent='Retry catalogue sync';
    }finally{
      button.disabled=false;
      if(button.textContent==='Sync complete')button.classList.add('secondary');
      else if(button.textContent===oldLabel)button.textContent=oldLabel;
    }
  });
});
