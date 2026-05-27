const $ = id => document.getElementById(id);
let currentDirection = null;

function openModal(direction) {
  currentDirection = direction;
  $('modal-title').textContent = direction === 'profit' ? '记录赚了' : '记录亏了';
  $('modal').classList.remove('hidden');
}

function closeModal(){
  $('modal').classList.add('hidden');
}

$('profit').addEventListener('click', ()=>openModal('profit'));
$('loss').addEventListener('click', ()=>openModal('loss'));
$('cancel').addEventListener('click', closeModal);

$('submit').addEventListener('click', async ()=>{
  const amount = parseFloat($('amount').value) || 0;
  const region = $('region').value;
  const alive = $('alive').checked;
  const currency = $('currency-select') ? $('currency-select').value : 'USD';
  // try convert on the client side by calling server proxy
  let amount_usd = amount;
  try{
    const rconv = await fetch(`/api/convert?from=${encodeURIComponent(currency)}&amount=${encodeURIComponent(amount)}`);
    const jconv = await rconv.json();
    amount_usd = Number(jconv.amount_usd || amount);
  }catch(e){ }
  const payload = { direction: currentDirection === 'profit' ? 'profit' : 'loss', amount, currency, amount_usd, region, alive };
  try{
    const r = await fetch('/api/entry', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload)});
    const j = await r.json();
    closeModal();
    loadLeaderboard();
    const info = `已记录（id:${j.id}）\n删除令牌（请保存以便删除）: ${j.deletion_token}`;
    alert(info);
  }catch(e){
    alert('提交失败');
  }
});

async function loadLeaderboard(){
  const el = $('leaderboard');
  el.textContent = '加载中…';
  try{
    const r = await fetch('/api/leaderboard');
    const rows = await r.json();
    if(!rows || rows.length===0){ el.textContent = '无数据'; return }
    el.innerHTML = rows.map(r=>`<div class="row"><strong>${r.region}</strong> — 次数: ${r.cnt}，亏损: ${Number(r.total_loss||0).toFixed(2)} USD</div>`).join('');
  }catch(e){ el.textContent = '加载失败' }
}

loadLeaderboard();

// conversion preview
const amountEl = $('amount');
const currencyEl = $('currency-select');
async function updateConversion(){
  if(!amountEl || !currencyEl) return;
  const a = Number(amountEl.value || 0);
  const cur = currencyEl.value || 'USD';
  try{
    const r = await fetch(`/api/convert?from=${encodeURIComponent(cur)}&amount=${encodeURIComponent(a)}`);
    const j = await r.json();
    $('amount-usd').textContent = Number(j.amount_usd||0).toFixed(2);
  }catch(e){ $('amount-usd').textContent = Number(a||0).toFixed(2) }
}
if(amountEl) amountEl.addEventListener('input', updateConversion);
if(currencyEl) currencyEl.addEventListener('change', updateConversion);

// privacy link
const pLink = $('privacy-link');
if(pLink){
  pLink.addEventListener('click', async (e)=>{
    e.preventDefault();
    try{
      const r = await fetch('/api/privacy');
      const j = await r.json();
      alert(j.text);
    }catch(e){ alert('无法加载隐私说明') }
  });
}
