const pages = ["home","rating","notes"];
const GOOGLE_SHEETS_URL = "https://script.google.com/macros/s/AKfycbwSqa8u4_wb8i9VRxAGKX1_XyIlc1gsKNT4yQc19-u5b9XvdFbsoY2suT6_ed2N0-mMxw/exec";
const intro = document.getElementById("intro");
const app = document.getElementById("app");
const modal = document.getElementById("successModal");
const closeModal = document.getElementById("closeModal");
const RATING_LOCK_DAYS = 30;
const BROWSER_ID_KEY = "pepla_rating_browser_id_v1";
const RATING_LOCK_KEY = "pepla_rating_lock_until_v1";

function getBrowserId(){
  let id = localStorage.getItem(BROWSER_ID_KEY);
  if(!id){
    id = (crypto.randomUUID ? crypto.randomUUID() : "pepla-" + Date.now() + "-" + Math.random().toString(36).slice(2));
    localStorage.setItem(BROWSER_ID_KEY,id);
  }
  document.cookie = `pepla_rating_browser_id=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax`;
  return id;
}
const browserId = getBrowserId();

function saveLocalLock(ms){
  localStorage.setItem(RATING_LOCK_KEY, String(Date.now()+ms));
}
function getLocalLock(){
  const until=Number(localStorage.getItem(RATING_LOCK_KEY)||0);
  return until>Date.now()?until:0;
}
function formatRemaining(until){
  const days=Math.max(1,Math.ceil((until-Date.now())/86400000));
  return days === 1 ? "Please try again in 1 day." : `Please try again in ${days} days.`;
}
function setRatingLocked(until){
  if(until) saveLocalLock(Math.max(0,until-Date.now()));
  const form=document.getElementById("ratingForm");
  if(form){
    form.classList.add("rating-locked");
    form.querySelectorAll("input,select,textarea,button").forEach(el=>{
      if(el.id!=="ratingBack") el.disabled=true;
    });
    let box=document.getElementById("ratingLockMessage");
    if(!box){
      box=document.createElement("div"); box.id="ratingLockMessage"; box.className="rating-lock-message";
      form.prepend(box);
    }
    box.textContent=`You have already submitted a rating. ${formatRemaining(until)}`;
  }
}
function checkRatingViaJsonp(){
  const local=getLocalLock();
  if(local){ setRatingLocked(local); return; }
  const callback="peplaRatingCheck_"+Date.now();
  const script=document.createElement("script");
  window[callback]=(result)=>{
    if(result && result.locked){
      const until=Date.now()+(result.remainingMs||RATING_LOCK_DAYS*86400000);
      setRatingLocked(until);
    }
    cleanup();
  };
  function cleanup(){ delete window[callback]; script.remove(); }
  script.onerror=cleanup;
  script.src=`${GOOGLE_SHEETS_URL}?action=checkRating&browserId=${encodeURIComponent(browserId)}&callback=${callback}`;
  document.body.appendChild(script);
}

setTimeout(() => {
  intro.classList.add("intro-finished");
  setTimeout(() => {
    intro.style.display = "none";
    app.classList.add("cards-ready");
    checkRatingViaJsonp();
  }, 300);
}, 1500);

function showPage(id) {
  pages.forEach(page => {
    const el = document.getElementById(page);
    el.classList.toggle("active-page", page === id);
  });
  window.scrollTo({top: 0, behavior: "smooth"});
}

document.querySelectorAll("[data-page]").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

/* Sales persons */
const salesList = document.getElementById("salesList");
const addSales = document.getElementById("addSales");

function createSalesRow() {
  const row = document.createElement("div");
  row.className = "sales-row";
  row.innerHTML = `
    <div class="sales-main">
      <input type="text" name="salesPerson[]" placeholder="Sales person name" />
      <div>
        <div class="sales-stars" aria-label="Rate this sales person">
          ${[1,2,3,4,5].map(n => `<button type="button" data-value="${n}">★</button>`).join("")}
        </div>
        <input type="hidden" name="salesRating[]" value="">
      </div>
    </div>
    <button type="button" class="remove-sales" aria-label="Remove sales person">×</button>
  `;

  row.querySelectorAll(".sales-stars button").forEach(star => {
    star.addEventListener("click", () => {
      const value = Number(star.dataset.value);
      row.querySelectorAll(".sales-stars button").forEach(s => {
        s.classList.toggle("selected", Number(s.dataset.value) <= value);
      });
      row.querySelector('input[name="salesRating[]"]').value = value;
    });
  });

  row.querySelector(".remove-sales").addEventListener("click", () => row.remove());
  salesList.appendChild(row);
}
addSales.addEventListener("click", createSalesRow);

/* Main branch rating */
const branchStars = document.querySelectorAll(".stars[data-target='branchRating'] button");
const branchRating = document.getElementById("branchRating");
const branchRatingText = document.getElementById("branchRatingText");

branchStars.forEach(star => {
  star.addEventListener("click", () => {
    const value = Number(star.dataset.value);
    branchRating.value = value;
    branchStars.forEach(s => s.classList.toggle("selected", Number(s.dataset.value) <= value));
    branchRatingText.textContent = `${value} / 5`;
  });
});

/* Demo submit behavior — Google Sheets will be connected later. */
function openSuccess() {
  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
}

async function sendToGoogleSheets(payload){if(!GOOGLE_SHEETS_URL)return {ok:true,demo:true};await fetch(GOOGLE_SHEETS_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});return {ok:true};}
function closeSuccess() {
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  showPage("home");
}
closeModal.addEventListener("click", closeSuccess);
modal.addEventListener("click", e => {
  if (e.target === modal) closeSuccess();
});

document.getElementById("ratingForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const local=getLocalLock();
  if(local){setRatingLocked(local);return;}
  if(!branchRating.value){alert("Please select a branch rating.");return;}
  const sales=[...salesList.querySelectorAll(".sales-row")].map(row=>({name:row.querySelector('input[name="salesPerson[]"]').value.trim(),rating:row.querySelector('input[name="salesRating[]"]').value||""})).filter(x=>x.name);
  const payload={type:"rating",browserId,date:new Date().toISOString(),branch:document.getElementById("branch").value,customerName:document.getElementById("customerName").value.trim(),phone:document.getElementById("phone").value.trim(),sales,branchRating:branchRating.value,note:document.getElementById("ratingNote").value.trim()};
  try{
    const result=await sendToGoogleSheets(payload);
    if(result && result.error === "RATING_LOCKED"){
      const until=Date.now()+RATING_LOCK_DAYS*86400000; setRatingLocked(until); return;
    }
    saveLocalLock(RATING_LOCK_DAYS*86400000);
    openSuccess(); e.target.reset(); branchStars.forEach(s=>s.classList.remove("selected")); branchRating.value=""; branchRatingText.textContent="Not rated"; salesList.innerHTML="";
    setRatingLocked(Date.now()+RATING_LOCK_DAYS*86400000);
  }catch(err){alert("Something went wrong while sending your feedback. Please try again.");}
});

document.getElementById("notesForm").addEventListener("submit",async e=>{e.preventDefault();const payload={type:"note",date:new Date().toISOString(),customerName:document.getElementById("notesCustomer").value.trim(),phone:document.getElementById("notesPhone").value.trim(),productName:document.getElementById("productName").value.trim(),recommendation:document.getElementById("recommendation").value.trim()};try{openSuccess();e.target.reset();sendToGoogleSheets(payload).catch(()=>{});}catch(err){alert("Something went wrong while sending your note. Please try again.");}});

