/**
 * BLINK & STITCH — a beginner-friendly MediaPipe prototype.
 * No framework / npm required. The camera is requested BEFORE MediaPipe loads.
 * MediaPipe Face Landmarker: detect blink + simple expression animation.
 * Use the on-screen button or Space to test the game without a camera.
 */
'use strict';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MEDIAPIPE_VERSION = '1.1.1';
const MEDIAPIPE_JS = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

// To change the game, edit these rounds. No fixed positions / facial slots.
const ROUNDS = [
  { type: 'eye',  goal: 2, label: '眼睛',  title: '两只眼睛',   prompt: '当眼睛经过布娃娃的脸时，眨一下眼。' },
  { type: 'nose', goal: 1, label: '鼻子',  title: '一只鼻子',   prompt: '鼻子可以落在脸上的任意位置。' },
  { type: 'mouth',goal: 1, label: '嘴巴',  title: '一张嘴巴',   prompt: '即使嘴巴落在额头上，以后仍能跟随你张嘴。' },
  { type: 'brow', goal: 2, label: '眉毛',  title: '两条眉毛',   prompt: '最后是眉毛，别担心它们是否对称。' },
];
const FEATURE_SIZES = {eye:[76,56],nose:[64,66],mouth:[98,61],brow:[99,47]};
const STYLES = {
  eye: [
    {name:'蜜糖眼睛',style:'classic',iris:'#aa744f'},
    {name:'湖蓝毛毡眼睛',style:'classic',iris:'#7399a8'},
    {name:'苔绿色星星眼睛',style:'star',iris:'#7f9673'},
    {name:'纽扣眼睛',style:'button',iris:'#61535a'},
    {name:'月桂刺绣眼睛',style:'embroidered',iris:'#986c7b'},
  ],
  nose: [
    {name:'布艺圆鼻',style:'round',color:'#bf8479'},
    {name:'三角粉鼻',style:'triangle',color:'#c9898a'},
    {name:'褐色纽扣鼻',style:'button',color:'#af7d60'},
    {name:'珊瑚爱心鼻',style:'heart',color:'#c97f83'},
  ],
  mouth: [
    {name:'微笑嘴巴',style:'smile'},
    {name:'绣线嘴巴',style:'stitched'},
    {name:'惊讶张嘴',style:'open'},
    {name:'露齿笑嘴巴',style:'teeth'},
    {name:'莓果爱心嘴',style:'heart'},
  ],
  brow: [
    {name:'拱形眉毛',style:'arched',color:'#745548'},
    {name:'直直的眉毛',style:'straight',color:'#aa7767'},
    {name:'歪歪的眉毛',style:'crooked',color:'#73625f'},
    {name:'赤茶眉毛',style:'arched',color:'#ad7774'},
  ],
};
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const faceTarget = $('faceTarget');
const partsLayer = $('partsLayer');
const video = $('webcam');
const blinkButton = $('blinkBtn');
const cameraButton = $('cameraBtn');
const overlay = $('transitionOverlay');
const roundEls = [...document.querySelectorAll('.round-item')];

let currentRound = 0;
let gameMode = 'catch'; // catch | transitioning | expression
let catchCount = ROUNDS.map(() => 0);
let falling = [];
let attached = [];
let nextId = 0;
let spawnClock = 0;
let previousAnimationTime = 0;
let transitionTimer;
let model = null;
let stream = null;
let modelLoading = null;
let lastVideoTime = -1;
let lastDetectAt = 0;
let lastFaceSeenAt = 0;
let cameraActive = false;
let pendingBlink = false;
let lastBlinkAt = 0;
let blinkClosed = false;
let filteredBlink = 0;
let faceMetrics = {};
let toastTimer;
let manualExpressionEnd = 0;

const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const rand = (a,b) => a+Math.random()*(b-a);
const pick = (items) => items[Math.floor(Math.random()*items.length)];
const stageRect = () => stage.getBoundingClientRect();
const faceRect = () => faceTarget.getBoundingClientRect();
const fmt = (value) => `${Math.round(value*100)}%`;

function toast(message) {
  const el=$('toast'); el.textContent=message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3300);
}
function setCameraStatus(text,kind='') {
  $('trackerStatus').textContent=text;
  $('statusDot').className=`status-dot ${kind}`;
}
function setModelStatus(text) { $('modelFlag').textContent=text; }

function createPart(type) {
  const variant=pick(STYLES[type]);
  const dom=document.createElement('div');
  const dims=FEATURE_SIZES[type];
  dom.className=`feature ${type}-feature`;
  dom.dataset.type=type;
  dom.dataset.style=variant.style;
  dom.setAttribute('aria-label',variant.name);
  dom.style.width=`${dims[0]}px`;
  dom.style.height=`${dims[1]}px`;
  dom.style.setProperty('--eye-scale',1);
  dom.style.setProperty('--mouth-width',1);
  dom.style.setProperty('--mouth-stretch',1);
  dom.style.setProperty('--brow-shift','0px');
  dom.style.setProperty('--nose-scale',1);
  dom.style.setProperty('--nose-tilt','0deg');
  dom.style.setProperty('--float-delay',`${rand(-2.5,0).toFixed(2)}s`);
  dom.style.setProperty('--float-duration',`${rand(2.2,3.4).toFixed(2)}s`);
  if(type==='eye') {
    dom.style.setProperty('--iris',variant.iris);
    dom.innerHTML='<span class="feature-art"><span class="lash lash-left"></span><span class="eye-shape"><span class="iris"><span class="pupil"></span></span></span><span class="lash lash-right"></span></span>';
  } else if(type==='nose') {
    dom.style.setProperty('--nose-color',variant.color);
    dom.innerHTML='<span class="feature-art"><span class="nose-shape"><span class="nose-stitches"></span></span></span>';
  } else if(type==='mouth') {
    dom.innerHTML='<span class="feature-art"><span class="mouth-shape"><span class="mouth-detail"></span></span></span>';
  } else if(type==='brow') {
    dom.style.setProperty('--brow-color',variant.color);
    dom.innerHTML='<span class="feature-art"><span class="brow-shape"><span class="brow-fiber"></span></span></span>';
  }
  partsLayer.appendChild(dom);
  const sr=stageRect(); const fr=faceRect();
  // Drop lanes overlap the doll's entire face: it can land ANYWHERE inside the silhouette.
  const centerX=fr.left-sr.left+fr.width*rand(.08,.92);
  const wobble=rand(1.5,6.5);
  const part={id:++nextId,el:dom,type,w:dims[0],h:dims[1],
    x:clamp(centerX-dims[0]/2,4,sr.width-dims[0]-4),y:-dims[1]-rand(0,65),
    fallSpeed:rand(95,135),gravity:rand(14,28),drift:rand(-9,9),wave:wobble,phase:rand(0,6.3),angle:rand(-18,18),
    attached:false,uv:null,
  };
  positionPart(part);
  falling.push(part);
  return part;
}

function positionPart(part) {
  part.el.style.transform=`translate3d(${part.x.toFixed(1)}px,${part.y.toFixed(1)}px,0) rotate(${part.angle.toFixed(1)}deg)`;
}
function insideFace(part) {
  const sr=stageRect(),fr=faceRect();
  const centerX=part.x+part.w*.5+sr.left;
  const centerY=part.y+part.h*.5+sr.top;
  const rx=fr.width*.48,ry=fr.height*.49;
  const dx=(centerX-(fr.left+fr.width/2))/rx;
  const dy=(centerY-(fr.top+fr.height/2))/ry;
  return (dx*dx+dy*dy)<=1;
}
function findCatchCandidate() {
  const sr=stageRect(),fr=faceRect();
  const cx=fr.left-sr.left+fr.width/2;
  const cy=fr.top-sr.top+fr.height/2;
  return falling.filter(insideFace).sort((a,b)=>{
    const da=(a.x+a.w/2-cx)**2+(a.y+a.h/2-cy)**2;
    const db=(b.x+b.w/2-cx)**2+(b.y+b.h/2-cy)**2;
    return da-db;
  })[0] ?? null;
}
function fireworks(part) {
  const holder=$('catchSparkles');
  for(let i=0;i<7;i++){
    const star=document.createElement('span');star.className='spark';star.textContent=i%2?'✦':'✳';
    const rad=(Math.PI*2*i/7);
    star.style.left=`${part.x+part.w/2}px`;star.style.top=`${part.y+part.h/2}px`;
    star.style.setProperty('--sx',`${Math.cos(rad)*rand(38,75)}px`);
    star.style.setProperty('--sy',`${Math.sin(rad)*rand(30,65)}px`);
    holder.appendChild(star);setTimeout(()=>star.remove(),800);
  }
}
function freezePart(part) {
  part.attached=true;
  falling=falling.filter(p=>p!==part);
  part.el.classList.add('captured');
  setTimeout(()=>part.el.classList.add('stitched-in'),720);
  part.el.style.willChange='auto';
  const sr=stageRect(),fr=faceRect();
  // Save the relative position within the actual face, so resizing doesn't rearrange features.
  part.uv={u:(part.x+part.w/2-(fr.left-sr.left))/fr.width,
           v:(part.y+part.h/2-(fr.top-sr.top))/fr.height};
  if(part.type==='eye') part.side=attached.filter(p=>p.type==='eye').length===0?'left':'right';
  if(part.type==='brow') part.side=attached.filter(p=>p.type==='brow').length===0?'left':'right';
  attached.push(part);
  fireworks(part);
}

function captureOnBlink() {
  if(gameMode!=='catch') return;
  const piece=findCatchCandidate();
  if(!piece){$('detectFeedback').textContent='眨眼成功，但暂时没有五官经过脸部';return;}
  freezePart(piece);
  const index=currentRound;
  catchCount[index]++;
  $('detectFeedback').textContent=`✦ 接住了${piece.el.getAttribute('aria-label')}！`;
  updateRoundUI();
  if(catchCount[index]>=ROUNDS[index].goal){advanceRound();}
}

function clearFalling(){for(const item of falling)item.el.remove();falling=[];}
function advanceRound(){
  gameMode='transitioning';clearFalling();
  const next=currentRound+1;
  $('transitionText').textContent=next<ROUNDS.length?`下一轮：${ROUNDS[next].label}`:'你的娃娃，活过来了';
  overlay.classList.remove('hidden');
  clearTimeout(transitionTimer);
  transitionTimer=setTimeout(()=>{
    overlay.classList.add('hidden');
    if(next>=ROUNDS.length) finishGame();
    else {currentRound=next;gameMode='catch';spawnClock=0;createPart(ROUNDS[currentRound].type);updateRoundUI();}
  },1350);
}
function finishGame(){
  gameMode='expression';
  $('roundLabel').textContent='ACTIVATE / 表情模式';
  $('roundTitle').innerHTML='现在，<span>它会模仿你。</span>';
  $('progressText').textContent='✓';
  $('gameHint').textContent='试试眨眼、张嘴、微笑、挑眉：无论五官在哪里，它们都会响应。';
  blinkButton.innerHTML='◉ 测试表情 <small>(空格)</small>';
  for(const node of roundEls)node.classList.add('done');
  $('detectFeedback').textContent='拼贴完成！五官已连接真实表情。';
  toast('完成啦。让布娃娃模仿你的表情。');
}
function updateRoundUI(){
  const round=ROUNDS[currentRound];
  $('roundLabel').textContent=`ROUND ${String(currentRound+1).padStart(2,'0')} / ${round.label}`;
  $('roundTitle').innerHTML=`接住 <span>${round.title}</span>`;
  $('progressText').textContent=`${catchCount[currentRound]} / ${round.goal}`;
  $('gameHint').textContent=round.prompt;
  roundEls.forEach((el,i)=>{
    el.classList.toggle('active',i===currentRound);
    el.classList.toggle('done',i<currentRound);
  });
  catchCount.forEach((count,i)=>{
    $(`roundCount${i}`).textContent=`${count} / ${ROUNDS[i].goal}`;
  });
}
function resetGame(){
  clearTimeout(transitionTimer);
  clearFalling();for(const item of attached)item.el.remove();attached=[];
  currentRound=0;catchCount=ROUNDS.map(()=>0);gameMode='catch';spawnClock=0;
  overlay.classList.add('hidden');
  blinkButton.innerHTML='◉ 模拟眨眼 <small>(空格)</small>';
  $('detectFeedback').textContent=cameraActive?'等待你眨眼 ...':'等待检测 ...';
  updateRoundUI();createPart('eye');toast('重新开始：接住两只眼睛。');
}

// --- MediaPipe / camera (camera permission is ALWAYS requested first) ---
async function toggleCamera(){
  if(cameraActive){stopCamera();return;}
  if(!navigator.mediaDevices?.getUserMedia){
    setCameraStatus('无 Camera API：请使用 Chrome 的 localhost 或 HTTPS','error');
    toast('无法申请相机：请通过 localhost 或 HTTPS 打开网页。');
    return;
  }
  cameraButton.disabled=true;
  setCameraStatus('正在申请摄像头权限 ...');
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
    video.srcObject=stream;
    await video.play();
    cameraActive=true;
    $('cameraMessage').classList.add('hidden');
    $('cameraLight').className='lamp on';$('liveLight').className='live-circle on';
    $('cameraBrief').textContent='相机已开启';
    cameraButton.textContent='◻ 关闭摄像头';
    setCameraStatus('摄像头已开启，加载人脸模型 ...');
    await loadFaceModel();
  }catch(error){
    console.error('[Camera/MediaPipe]',error);
    // A model/network failure does NOT close the already working camera.
    if(!cameraActive){
      const explanation=error.name==='NotAllowedError'?'摄像头权限被拒绝，请检查 Chrome 的网站权限。':
        error.name==='NotFoundError'?'未找到摄像头，请检查设备连接。':
        `${error.name||'相机错误'}：${error.message||'请查看 Console'}`;
      setCameraStatus(explanation,'error');toast(explanation);stopCamera(true);
    }
  }finally{cameraButton.disabled=false;}
}
function stopCamera(silent=false){
  if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
  video.srcObject=null;cameraActive=false;lastVideoTime=-1;filteredBlink=0;blinkClosed=false;
  $('cameraMessage').classList.remove('hidden');
  $('cameraLight').className='lamp';$('liveLight').className='live-circle';
  $('cameraBrief').textContent='相机未启动';cameraButton.textContent='◉ 启动摄像头';
  if(!silent){setCameraStatus('摄像头已关闭');toast('已关闭摄像头。可以继续用空格测试。');}
  $('blinkFill').style.width='0%';$('blinkValue').textContent='0%';
}

async function chooseModelPath(){
  // Optional: if the local .task file exists, use it; otherwise use the official URL.
  try{
    const response=await fetch('./models/face_landmarker.task',{method:'HEAD',cache:'no-store'});
    const length=Number(response.headers.get('content-length')||0);
    if(response.ok && (length>100000 || response.headers.get('content-type')?.includes('octet-stream')))
      return new URL('./models/face_landmarker.task',location.href).href;
  }catch(_){}
  return MODEL_URL;
}
async function loadFaceModel(){
  if(model){setModelStatus('READY');setCameraStatus('模型就绪，正在寻找脸部','on');return;}
  if(modelLoading){await modelLoading;return;}
  modelLoading=(async()=>{
    try{
      setModelStatus('JS...');
      const {FaceLandmarker,FilesetResolver}=await import(MEDIAPIPE_JS);
      setModelStatus('WASM...');
      const files=await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      setModelStatus('MODEL...');
      const modelPath=await chooseModelPath();
      const options={baseOptions:{modelAssetPath:modelPath,delegate:'CPU'},
        runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,
        minFaceDetectionConfidence:0.5,minFacePresenceConfidence:0.5,minTrackingConfidence:0.5};
      model=await FaceLandmarker.createFromOptions(files,options);
      setModelStatus('READY');setCameraStatus('模型就绪，请正对摄像头','on');
      toast('Face Landmarker 已就绪，可以用眨眼捕捉五官。');
    }catch(error){
      console.error('[MediaPipe] load error',error);
      model=null;
      setModelStatus('FAILED');
      setCameraStatus('相机正常，但 MediaPipe 加载失败（检查网络/Console）','error');
      toast('MediaPipe 模型未加载。可按空格测试，或检查 README 的离线模型方案。');
      throw error;
    }finally{modelLoading=null;}
  })();
  await modelLoading;
}
function scoresFromResults(results){
  const items=results.faceBlendshapes?.[0]?.categories||[];
  return Object.fromEntries(items.map(x=>[x.categoryName,x.score]));
}
function analyzeFrame(now){
  if(!cameraActive || !model || video.readyState<2 || now-lastDetectAt<80)return;
  lastDetectAt=now;
  if(video.currentTime===lastVideoTime)return;
  lastVideoTime=video.currentTime;
  try{
    const results=model.detectForVideo(video,now);
    const found=!!results.faceLandmarks?.length;
    if(!found){
      if(now-lastFaceSeenAt>400){$('eyeText').textContent='FACE NOT FOUND';setCameraStatus('请让脸完整出现在相机画面中');}
      faceMetrics={};filteredBlink=lerp(filteredBlink,0,.25);blinkClosed=false;
      showBlinkMeter(filteredBlink);return;
    }
    lastFaceSeenAt=now;
    if($('trackerStatus').textContent!=='FACE TRACKING')setCameraStatus('FACE TRACKING','on');
    faceMetrics=scoresFromResults(results);
    const l=faceMetrics.eyeBlinkLeft??0,r=faceMetrics.eyeBlinkRight??0;
    const blink=(l+r)/2;
    filteredBlink=lerp(filteredBlink,blink,.57);
    showBlinkMeter(filteredBlink,l,r);
    // Edge trigger + hysteresis: one blink means only one piece.
    // Closed threshold .58, open threshold .26. Guard short repeat.
    if(!blinkClosed && filteredBlink>.58 && Math.min(l,r)>.38 && now-lastBlinkAt>330){
      blinkClosed=true;lastBlinkAt=now;
      if(gameMode==='catch')captureOnBlink();
    }
    if(blinkClosed && filteredBlink<.26)blinkClosed=false;
  }catch(error){
    console.error('[MediaPipe] detectForVideo error:',error);
    setCameraStatus('视频识别错误，请刷新/查看 Console','error');
    // Disable detection rather than spamming errors every frame.
    model=null;setModelStatus('FAILED');
  }
}
function showBlinkMeter(value,left=0,right=0){
  $('blinkFill').style.width=fmt(clamp(value,0,1));$('blinkValue').textContent=fmt(clamp(value,0,1));
  const shut=value>.54;
  $('eyeText').textContent=shut?'BLINK DETECTED':'EYES OPEN';
  $('eyeDisplayLeft').textContent=left>.55?'─':'◉';
  $('eyeDisplayRight').textContent=right>.55?'─':'◉';
}

function applyExpressions(now){
  if(gameMode!=='expression'){
    // During construction previously placed eyes may blink along with the user.
    for(const part of attached){
      if(part.type==='eye'){
        const l=faceMetrics.eyeBlinkLeft??0,r=faceMetrics.eyeBlinkRight??0;
        part.el.style.setProperty('--eye-scale',(1-(part.side==='left'?l:r)*.88).toFixed(3));
      }
    }
    return;
  }
  const manual=now<manualExpressionEnd;
  const left=manual?1:(faceMetrics.eyeBlinkLeft??0);
  const right=manual?1:(faceMetrics.eyeBlinkRight??0);
  const jaw=manual?.9:(faceMetrics.jawOpen??0);
  const smile=manual?.8:((faceMetrics.mouthSmileLeft??0)+(faceMetrics.mouthSmileRight??0))/2;
  const brow=manual?.8:(faceMetrics.browInnerUp??0);
  const nose=(faceMetrics.noseSneerLeft??0)+(faceMetrics.noseSneerRight??0);
  for(const part of attached){
    if(part.type==='eye')part.el.style.setProperty('--eye-scale',clamp(1-(part.side==='left'?left:right)*.88,.1,1).toFixed(3));
    if(part.type==='mouth'){
      part.el.style.setProperty('--mouth-width',(1+smile*.28).toFixed(3));
      part.el.style.setProperty('--mouth-stretch',(1+jaw*1.6).toFixed(3));
    }
    if(part.type==='brow')part.el.style.setProperty('--brow-shift',`${Math.round(brow*-15)}px`);
    if(part.type==='nose'){
      part.el.style.setProperty('--nose-scale',(1+nose*.06).toFixed(3));
      part.el.style.setProperty('--nose-tilt',`${(nose*7).toFixed(1)}deg`);
    }
  }
}
function manualBlink(){
  if(gameMode==='transitioning')return;
  if(gameMode==='expression'){
    manualExpressionEnd=performance.now()+650;
    toast('测试表情：眨眼、张嘴、微笑。');
  }else{
    showBlinkMeter(1,1,1);
    captureOnBlink();
    setTimeout(()=>{if(!cameraActive)showBlinkMeter(0);},330);
  }
}
function onResize(){
  const sr=stageRect(),fr=faceRect();
  for(const part of attached){
    if(!part.uv)continue;
    part.x=(fr.left-sr.left)+fr.width*part.uv.u-part.w/2;
    part.y=(fr.top-sr.top)+fr.height*part.uv.v-part.h/2;
    positionPart(part);
  }
}
function renderFrame(now){
  const dt=clamp((now-(previousAnimationTime||now))/1000,0,.05);
  previousAnimationTime=now;
  analyzeFrame(now);
  if(gameMode==='catch'){
    spawnClock+=dt;
    if(spawnClock>.9 && falling.length<5){spawnClock=0;createPart(ROUNDS[currentRound].type);}
    for(let i=falling.length-1;i>=0;i--){
      const p=falling[i];
      p.fallSpeed+=p.gravity*dt;
      p.y+=p.fallSpeed*dt;
      p.x+=Math.sin(now/720+p.phase)*p.wave*dt +p.drift*dt*.27;
      p.x=clamp(p.x,0,Math.max(0,stage.clientWidth-p.w));
      positionPart(p);
      if(p.y>stage.clientHeight+80){p.el.remove();falling.splice(i,1);}
    }
  }
  const ready=gameMode==='catch' && falling.some(insideFace);
  faceTarget.classList.toggle('can-catch',ready);
  $('readyHint').classList.toggle('visible',ready);
  applyExpressions(now);
  requestAnimationFrame(renderFrame);
}

cameraButton.addEventListener('click',toggleCamera);
$('resetBtn').addEventListener('click',resetGame);
blinkButton.addEventListener('click',manualBlink);
window.addEventListener('keydown',e=>{
  if(e.code==='Space' && !e.repeat && !['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName)){
    e.preventDefault();manualBlink();
  }
});
window.addEventListener('resize',onResize);
window.addEventListener('beforeunload',()=>{if(stream)stream.getTracks().forEach(t=>t.stop());});

updateRoundUI();
createPart('eye');
requestAnimationFrame(renderFrame);
console.info('[Blink & Stitch] Ready. Press Space to test without a camera.');
