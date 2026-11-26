const DISPLAY='n5_lookup_display_v1';
const READING='n5_reading_preferences_v1';
const defaults={japanese:100,vietnamese:100,line:1.65,density:'balanced'};
const sizes={japanese:[85,125],vietnamese:[85,125],line:[1.35,2.1]};
const density={airy:'Thoáng',balanced:'Cân bằng',compact:'Gọn'};

function read(key) {
  try {return JSON.parse(localStorage.getItem(key) || '{}') || {};}
  catch {return {};}
}

export function readAnnotations() {
  const saved=read(DISPLAY);
  return {roman:saved.roman!==false,furigana:saved.furigana!==false};
}

function readDimensions() {
  const saved=read(READING);
  const value=Object.fromEntries(Object.entries(sizes).map(([key,[min,max]])=>
    [key,Number.isFinite(saved[key])?Math.max(min,Math.min(saved[key],max)):defaults[key]]));
  return {...value,density:Object.hasOwn(density,saved.density)?saved.density:defaults.density};
}

function apply(value,annotations) {
  const html=document.documentElement;
  html.style.setProperty('--n5-japanese-scale',String(value.japanese/100));
  html.style.setProperty('--n5-vietnamese-scale',String(value.vietnamese/100));
  html.style.setProperty('--n5-reading-line',String(value.line));
  html.dataset.n5Density=value.density;
  html.dataset.n5Furigana=String(annotations.furigana);
  html.dataset.n5Romaji=String(annotations.roman);
}

export function saveAnnotations(value) {
  try {localStorage.setItem(DISPLAY,JSON.stringify(value));} catch {}
  apply(readDimensions(),value);
  document.dispatchEvent(new CustomEvent('n5-annotations',{detail:value}));
}

export function mountReadingPreferences(root) {
  if (!root || root.dataset.n5Mounted) return;
  root.dataset.n5Mounted='true';
  let value=readDimensions();
  let annotations=readAnnotations();
  const slider=(name,label,step)=>'<label>'+label+' <output data-reading-output="'+name+'"></output><input type="range" name="'+name+
    '" min="'+sizes[name][0]+'" max="'+sizes[name][1]+'" step="'+step+'"></label>';
  root.innerHTML='<h2>Tùy chỉnh đọc</h2><div class="n5-reading-options">'+slider('japanese','Chữ tiếng Nhật',5)+
    slider('vietnamese','Chữ tiếng Việt',5)+slider('line','Khoảng cách dòng',.05)+
    '<label>Mật độ <select name="density">'+Object.entries(density).map(([key,title])=>'<option value="'+key+'">'+title+'</option>').join('')+
    '</select></label><label><input type="checkbox" name="furigana"> Hiện Furigana</label>'+
    '<label><input type="checkbox" name="roman"> Hiện Romaji</label></div>'+
    '<div class="n5-reading-example"><p lang="ja"><ruby>日本語<rt>にほんご</rt></ruby>を勉強しています。</p>'+
    '<p data-grammar-reading="roman">Nihongo o benkyō shite imasu.</p><p lang="vi">Đang học tiếng Nhật.</p></div>'+
    '<button type="button" class="n5-lookup-chip" data-reading-reset>Khôi phục mặc định</button>';
  function refresh() {
    for (const [key,current] of Object.entries(value)) {
      root.querySelector('[name="'+key+'"]').value=current;
      const output=root.querySelector('[data-reading-output="'+key+'"]');
      if (output) output.textContent=key==='line'?current.toFixed(2):current+'%';
    }
    for (const [key,visible] of Object.entries(annotations)) root.querySelector('[name="'+key+'"]').checked=visible;
  }
  function update() {
    try {localStorage.setItem(READING,JSON.stringify(value));} catch {}
    saveAnnotations(annotations);
    refresh();
  }
  root.addEventListener('input',event=>{
    const {name,checked}=event.target;
    if (Object.hasOwn(annotations,name)) annotations={...annotations,[name]:checked};
    else if (name==='density') value={...value,density:event.target.value};
    else if (Object.hasOwn(sizes,name)) value={...value,[name]:event.target.valueAsNumber};
    else return;
    update();
  });
  root.querySelector('[data-reading-reset]').addEventListener('click',()=>{
    value={...defaults};
    annotations={roman:true,furigana:true};
    update();
  });
  refresh();
}

if (typeof document!=='undefined') apply(readDimensions(),readAnnotations());
