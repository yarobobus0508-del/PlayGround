import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $=s=>document.querySelector(s), canvas=$('#scene');
const scene=new THREE.Scene(); scene.background=new THREE.Color('#a9c5cb'); scene.fog=new THREE.Fog('#a9c5cb',48,190);
const camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.1,450);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05;
scene.add(new THREE.HemisphereLight(0xdce9e4,0x59614c,2.1));
const sun=new THREE.DirectionalLight(0xffedcf,3.2); sun.position.set(-35,62,24); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.camera.left=-60;sun.shadow.camera.right=60;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;scene.add(sun);
const world=new THREE.Group();scene.add(world); let carRoot=new THREE.Group();scene.add(carRoot);let bodyGroup=new THREE.Group();carRoot.add(bodyGroup);let wheelMeshes=[];let deformParts=[];let carParts=[];let obstacles=[];let scenery=[];
const cars=[{name:'VORTEX S4',type:'СПОРТ-КУПЕ',color:0xc9f244,power:1.04},{name:'NOMAD XR',type:'РАЛЛИ-КРОСС',color:0xff704b,power:.91},{name:'TITAN 2500',type:'ПИКАП 4×4',color:0x79a9dc,power:.78},{name:'ARCTIC GT',type:'ГРАН-ТУРИЗМО',color:0xe9e5d8,power:1.12},{name:'MANTA RS',type:'ТРЕКОВЫЙ СПОРТ',color:0xa986e8,power:1.17},{name:'ROVER 6',type:'ВНЕДОРОЖНИК',color:0xd9a957,power:.84}];
const locations=[{id:'test',name:'ПОЛИГОН',label:'ТЕСТОВЫЙ ПОЛИГОН',desc:'ПРЕПЯТСТВИЯ · ТРАМПЛИНЫ',ground:0x565b54,sky:0xa9c5cb},{id:'desert',name:'ПУСТЫНЯ',label:'ПУСТЫННЫЙ КАНЬОН',desc:'ПЕСОК · СКАЛЫ · ДЮНЫ',ground:0xc5a36d,sky:0xe6b584},{id:'forest',name:'ЛЕС',label:'СЕВЕРНЫЙ ЛЕС',desc:'ХВОЙНЫЙ ЛЕС · ГРУНТ',ground:0x596c51,sky:0x9bb7b3},{id:'city',name:'ГОРОД',label:'МЕТРОПОЛИС',desc:'УЛИЦЫ · КВАРТАЛЫ · ПРОСПЕКТЫ',ground:0x55595a,sky:0xa0b2bd}];
let selectedCar=0,selectedLocation='test', carMeshes=[], speed=0, damage=0, impacts=0, yaw=0, steer=0, throttle=0, braking=false, handbrake=false, playing=false, lastTime=0, toastTimer=0, menuOpen=false;
const keys={};
function mat(color,roughness=.72,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function box(parent,w,h,d,material,x,y,z,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);if(opts.deform)deformParts.push(m);if(opts.obstacle)obstacles.push({mesh:m,x:m.position.x,z:m.position.z,r:Math.max(w,d)*.48+1.05,hx:w*.5,hz:d*.5});return m;}
function clearWorld(){while(world.children.length){const c=world.children.pop();c.geometry?.dispose();} obstacles=[];scenery=[];}
function ground(color){const g=new THREE.Mesh(new THREE.PlaneGeometry(500,500),mat(color,1));g.rotation.x=-Math.PI/2;g.position.y=-.07;g.receiveShadow=true;world.add(g);}
function makeRoad(x,z,w,d,color=0x424744){const m=new THREE.Mesh(new THREE.BoxGeometry(w,.12,d),mat(color,.96));m.position.set(x,-.005,z);m.receiveShadow=true;world.add(m);return m;}
function propBox(x,z,w,h,d,color,opts={}){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,h/2,z);m.castShadow=true;m.receiveShadow=true;world.add(m);if(opts.hit)obstacles.push({mesh:m,x,z,r:Math.max(w,d)*.51+1,hx:w/2,hz:d/2});return m;}
function buildWorld(id){clearWorld();const L=locations.find(a=>a.id===id);scene.background.setHex(L.sky);scene.fog.color.setHex(L.sky);scene.fog.near=id==='city'?65:48;scene.fog.far=id==='city'?230:190;ground(L.ground);
 if(id==='test'){
  makeRoad(0,0,180,180,0x4a4e49);for(let n=-80;n<=80;n+=20){makeRoad(n,0,1.3,180,0x77796d);makeRoad(0,n,180,1.3,0x77796d);}
  for(let i=-70;i<=70;i+=10){for(const z of [-58,58])box(world,1.3,.55,1.3,mat(0xd4ff4f),i,.26,z);}
  for(const [x,z,c] of [[-13,12,0xff704b],[13,13,0x5683a6],[-15,-14,0xd4ff4f],[16,-15,0xe5e1d5]])propBox(x,z,2.2,1.1,2.2,c,{hit:true});
  for(let n=0;n<6;n++){const x=-23+n*9;const ramp=new THREE.Mesh(new THREE.BoxGeometry(6,.65,9),mat(0x858980));ramp.position.set(x,.35,27);ramp.rotation.x=-.22;ramp.castShadow=true;ramp.receiveShadow=true;world.add(ramp);obstacles.push({mesh:ramp,x,z:27,r:4.7,hx:3,hz:4.5});}
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2;propBox(Math.cos(a)*35,Math.sin(a)*35,1.2,1.5,1.2,i%2?0xe2a451:0xe6e1d0,{hit:true});}
  // low concrete crash barriers
  for(const z of [-24,24]){const wall=propBox(0,z,45,.55,.65,0xa7aaa0,{hit:true});wall.position.y=.275;}
 } else if(id==='desert'){
  makeRoad(0,0,18,180,0x76664e);makeRoad(0,0,155,15,0x76664e);
  for(let i=0;i<22;i++){let x=(i%2?1:-1)*(25+Math.random()*65),z=(Math.random()-.5)*155,r=2+Math.random()*5;let rock=new THREE.Mesh(new THREE.DodecahedronGeometry(r,0),mat(i%2?0x927c5d:0xb39a72));rock.position.set(x,r*.45,z);rock.scale.y=.7;rock.castShadow=true;world.add(rock);obstacles.push({mesh:rock,x,z,r:r*.75+1,hx:r,hz:r});}
  for(let i=0;i<22;i++){let x=(Math.random()-.5)*145,z=(Math.random()-.5)*175;if(Math.abs(x)<12)continue;const trunk=propBox(x,z,.35,2.6,.35,0x51724c);propBox(x,z,1.7,1.1,.55,0x648050);trunk.position.y=1.3;}
  for(let i=0;i<8;i++){const x=-35+i*10;const ramp=new THREE.Mesh(new THREE.BoxGeometry(8,1,13),mat(0xb78a58));ramp.position.set(x,.5,34);ramp.rotation.x=-.28;world.add(ramp);obstacles.push({mesh:ramp,x,z:34,r:7,hx:4,hz:6});}
 } else if(id==='forest'){
  makeRoad(0,0,18,190,0x5c5b4b);makeRoad(0,0,130,13,0x5c5b4b);
  for(let i=0;i<92;i++){const x=(Math.random()-.5)*180,z=(Math.random()-.5)*190;if(Math.abs(x)<13||Math.abs(z)<13)continue;const h=5+Math.random()*8,r=1.1+Math.random()*1.5;const trunk=propBox(x,z,.65,h*.5,.65,0x69543e,{hit:true});trunk.position.y=h*.25;const pine=new THREE.Mesh(new THREE.ConeGeometry(r,h*.62,7),mat(i%2?0x35513a:0x3e6042));pine.position.set(x,h*.69,z);pine.castShadow=true;world.add(pine);obstacles.push({mesh:pine,x,z,r:r*.7+1,hx:r,hz:r});}
  for(let i=0;i<22;i++){let x=(Math.random()-.5)*145,z=(Math.random()-.5)*170;if(Math.abs(x)<12)continue;propBox(x,z,1.3,.7,1.3,0x8e8a70,{hit:true});}
 } else {
  makeRoad(0,0,180,20,0x393e40);makeRoad(0,0,20,180,0x393e40);for(const n of [-60,-30,30,60]){makeRoad(n,0,14,180,0x393e40);makeRoad(0,n,180,14,0x393e40);}
  for(let x=-78;x<=78;x+=30){for(let z=-78;z<=78;z+=30){if(Math.abs(x)<20||Math.abs(z)<20)continue;const w=18+Math.random()*5,d=18+Math.random()*5,h=13+Math.random()*32;const shades=[0x697678,0x858887,0x747c7a,0x9a9280];const b=propBox(x,z,w,h,d,shades[Math.floor(Math.random()*shades.length)],{hit:true});b.position.y=h/2;for(let floor=3;floor<h-2;floor+=3.8){for(let side=-1;side<=1;side++){const win=new THREE.Mesh(new THREE.BoxGeometry(.8,1.25,.09),mat(0xadd2d2,.28,.25));win.position.set(x+side*4,floor,z+d/2+.06);world.add(win);const win2=win.clone();win2.position.z=z-d/2-.06;world.add(win2);}}}}
 }
 // distant perimeter markers and skyline silhouettes
 if(id!=='city')for(let i=0;i<40;i++){const a=i/40*Math.PI*2,r=118;const post=propBox(Math.cos(a)*r,Math.sin(a)*r,.45,1.1,.45,id==='desert'?0xc59b62:0x66715c);post.position.y=.55;}
}

function createCar(index){
 while(carRoot.children.length){const c=carRoot.children.pop();c.traverse?.(o=>{o.geometry?.dispose();});}
 bodyGroup=new THREE.Group();carRoot.add(bodyGroup);wheelMeshes=[];deformParts=[];carMeshes=[];const spec=cars[index],paint=mat(spec.color,.3,.34),dark=mat(0x171b1b,.58,.12),glass=mat(0x25383b,.22,.38),trim=mat(0xa6aaa0,.35,.55),lamp=mat(0xeef4d5,.2,.1),red=mat(0xc94335,.28,.1);
 function shell(w,h,d,x,y,z,color=paint){const m=box(bodyGroup,w,h,d,color,x,y,z,{deform:true});carMeshes.push(m);return m;}
 shell(1.87,.48,4.05,0,.68,0); // central body shell
 shell(1.84,.22,1.3,0,.83,1.35); // hood
 shell(1.8,.22,1.15,0,.83,-1.38); // rear deck
 shell(1.94,.18,.28,0,.48,2.1,paint); // front bumper
 shell(1.94,.18,.28,0,.48,-2.1,paint); // rear bumper
 // cabin and windshield profile
 const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.48,.61,1.92),glass);cabin.position.set(0,1.21,-.12);cabin.castShadow=true;bodyGroup.add(cabin);
 const roof=shell(1.43,.13,1.08,0,1.59,-.18);
 // bright windshield panels
 const frontGlass=new THREE.Mesh(new THREE.BoxGeometry(1.39,.51,.08),glass);frontGlass.position.set(0,1.23,.83);frontGlass.rotation.x=-.19;bodyGroup.add(frontGlass);
 const rearGlass=frontGlass.clone();rearGlass.position.z=-1.05;rearGlass.rotation.x=.22;bodyGroup.add(rearGlass);
 for(const x of [-.77,.77]){for(const z of [-.81,.78]){const pillar=new THREE.Mesh(new THREE.BoxGeometry(.09,.62,.1),paint);pillar.position.set(x,1.22,z);bodyGroup.add(pillar);}
  // side mirrors, door handles, sills
  box(bodyGroup,.22,.12,.19,paint,x*1.04,1.12,.72);box(bodyGroup,.08,.07,.07,trim,x*1.02,1.05,.05);
 }
 for(const x of [-.59,.59]){for(const z of [-1.25,1.25]){const wheel=new THREE.Group();wheel.position.set(x,.39,z);carRoot.add(wheel);const tire=new THREE.Mesh(new THREE.CylinderGeometry(.39,.39,.25,20),dark);tire.rotation.z=Math.PI/2;tire.castShadow=true;wheel.add(tire);const rim=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.265,12),trim);rim.rotation.z=Math.PI/2;wheel.add(rim);const hub=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.28,12),mat(0x555b56,.3,.7));hub.rotation.z=Math.PI/2;wheel.add(hub);wheelMeshes.push({group:wheel,front:z>0,tire});}}
 // headlights, grille and rear lamps
 box(bodyGroup,.42,.13,.06,lamp,-.57,.79,2.06);box(bodyGroup,.42,.13,.06,lamp,.57,.79,2.06);box(bodyGroup,.7,.13,.06,dark,0,.55,2.1);
 box(bodyGroup,.42,.12,.06,red,-.58,.78,-2.06);box(bodyGroup,.42,.12,.06,red,.58,.78,-2.06);
 // hood ribs and rear diffuser
 for(const x of [-.56,.56])box(bodyGroup,.045,.02,.78,trim,x,.951,1.35);
 for(const x of [-.62,.62])box(bodyGroup,.18,.12,.09,dark,x,.35,-2.16);
 // Interior silhouette
 box(bodyGroup,.82,.16,.66,dark,0,1.08,-.05);box(bodyGroup,.12,.31,.12,trim,0,1.26,.42);
 carRoot.position.set(0,0,0);carRoot.rotation.set(0,yaw,0);
}
function startLocation(id){selectedLocation=id;buildWorld(id);createCar(selectedCar);$('#locationLabel').textContent=locations.find(x=>x.id===id).name;$('#mapName').textContent=locations.find(x=>x.id===id).label;resetCar(false);}
function resetCar(show=true){carRoot.position.set(0,0,-1);yaw=0;carRoot.rotation.y=0;speed=0;damage=0;impacts=0;steer=0;updateHud();if(show)showToast('МАШИНА ВОССТАНОВЛЕНА');}
function updateHud(){const km=Math.round(Math.abs(speed)*3.6);$('#speed').textContent=String(km).padStart(3,'0');$('#speedFill').style.width=Math.min(100,km/1.65)+'%';$('#rpm').textContent=(.7+Math.min(6,km/30)).toFixed(1);$('#gear').textContent=speed<-.5?'R':km>1?'D':'N';$('#damageValue').textContent=Math.round(damage)+'%';$('#damageFill').style.width=damage+'%';$('#impactCount').textContent=impacts;$('#damageStatus').textContent=damage>65?'КРИТИЧЕСКИЕ ПОВРЕЖДЕНИЯ':damage>25?'КУЗОВ ДЕФОРМИРОВАН':'ВСЁ В ПОРЯДКЕ';$('.status-dot').style.background=damage>65?'#ff6045':damage>25?'#ffc34f':'var(--lime)';}
function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1550);}

function deformAt(point,strength){
 carRoot.updateMatrixWorld(true);const hit=point.clone();carRoot.worldToLocal(hit);const localX=hit.x,localZ=hit.z;
 const front=Math.abs(localZ)>Math.abs(localX),side=!front,sign=front?Math.sign(localZ):Math.sign(localX),radius=front?1.55:1.13,depth=Math.min(.48,.07+strength*.38);
 for(const mesh of deformParts){const geo=mesh.geometry,attr=geo.attributes.position;if(!geo.userData.base)geo.userData.base=Float32Array.from(attr.array);const base=geo.userData.base;
  const pHit=mesh.worldToLocal(point.clone());let touched=false;
  for(let i=0;i<attr.count;i++){const bx=base[i*3],by=base[i*3+1],bz=base[i*3+2],dx=bx-pHit.x,dy=by-pHit.y,dz=bz-pHit.z;const dist=Math.sqrt(dx*dx+dy*dy*.8+dz*dz);if(dist<radius){const fall=(1-dist/radius);const amount=depth*fall*fall;let x=bx,y=by,z=bz;if(front)z-=sign*amount;else x-=sign*amount;y-=amount*.14;attr.setXYZ(i,x,y,z);touched=true;}}
  if(touched){attr.needsUpdate=true;geo.computeVertexNormals();geo.computeBoundingSphere();}
 }
}
function sparks(point,power){const group=new THREE.Group();group.position.copy(point);world.add(group);const count=10;for(let i=0;i<count;i++){const p=new THREE.Mesh(new THREE.IcosahedronGeometry(.035+Math.random()*.045,0),mat(i%3?0xffb64a:0xffffff,.25));p.position.set((Math.random()-.5)*.8,.4+Math.random()*.8,(Math.random()-.5)*.8);p.userData.v=new THREE.Vector3((Math.random()-.5)*4,1+Math.random()*4,(Math.random()-.5)*4);p.userData.life=.35+Math.random()*.45;group.add(p);}scenery.push({group,kind:'sparks'});const flash=$('#damageFlash');flash.style.opacity=String(Math.min(.55,power*.3));setTimeout(()=>flash.style.opacity='0',100);}
function hitObstacle(ob,dx,dz,impactSpeed){const now=performance.now();if(now-(ob.lastHit||0)<480)return;ob.lastHit=now;const power=Math.min(1,Math.max(.22,(impactSpeed-1.6)/17));const fwd=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));const localX=dx*right.x+dz*right.z,localZ=dx*fwd.x+dz*fwd.z;const signFront=Math.sign(localZ)||1;const point=carRoot.position.clone().add(fwd.multiplyScalar(Math.sign(localZ)*1.75)).add(right.multiplyScalar(Math.sign(localX)*.62));point.y=.68;deformAt(point,power);damage=Math.min(100,damage+power*(9+Math.min(15,impactSpeed*1.1)));impacts++;speed=-Math.sign(speed||1)*Math.max(1.2,Math.abs(speed)*(0.32+Math.random()*.13));carRoot.position.add(new THREE.Vector3(-dx,0,-dz).normalize().multiplyScalar(.45));steer+=Math.sign(localX)*.12;sparks(point, power);updateHud();}
function checkCollisions(){for(const ob of obstacles){const dx=ob.x-carRoot.position.x,dz=ob.z-carRoot.position.z;const fwdX=Math.sin(yaw),fwdZ=Math.cos(yaw),rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);const lx=dx*rightX+dz*rightZ,lz=dx*fwdX+dz*fwdZ;const overlapX=Math.abs(lx)<.92+ob.hx,overlapZ=Math.abs(lz)<2.12+ob.hz;if(overlapX&&overlapZ&&Math.abs(speed)>2.1){hitObstacle(ob,dx,dz,Math.abs(speed));break;}}}
function update(dt,time){if(!playing){speed*=Math.exp(-dt*1.7);}else{
 const forward=(keys.KeyW||keys.ArrowUp||throttle>0)?1:0,back=(keys.KeyS||keys.ArrowDown||braking)?1:0;const steerInput=(keys.KeyA||keys.ArrowLeft?-1:0)+(keys.KeyD||keys.ArrowRight?1:0)+steer;const hb=keys.Space||handbrake;
 if(forward)speed+=15.5*cars[selectedCar].power*dt;else if(back)speed-=10*dt;else speed*=Math.exp(-dt*(hb?2.5:.48));speed=THREE.MathUtils.clamp(speed,-15,56*cars[selectedCar].power);if(hb)speed*=Math.exp(-dt*1.2);
 const steeringFactor=Math.min(1,Math.abs(speed)/4);yaw+=steerInput*dt*1.6*steeringFactor*Math.sign(speed||1)*(hb?1.3:1);const forwardVec=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));carRoot.position.addScaledVector(forwardVec,speed*dt);
 if(Math.abs(speed)>4){carRoot.position.x+=Math.sin(yaw+Math.PI/2)*speed*dt*(hb?-.025:0);}
 checkCollisions();
 }
 carRoot.rotation.y=yaw;for(const w of wheelMeshes){w.group.rotation.y=w.front?-Math.sin(steer||0)*.24:0;w.tire.rotation.x+=speed*dt*2.7;}
 const fwd=new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));const target=carRoot.position.clone().addScaledVector(fwd,-8.6);target.y+=4.4;camera.position.lerp(target,1-Math.exp(-dt*3.1));const look=carRoot.position.clone().addScaledVector(fwd,2);look.y+=.8;camera.lookAt(look);
 for(let i=scenery.length-1;i>=0;i--){const s=scenery[i];if(s.kind==='sparks'){for(const p of [...s.group.children]){p.userData.life-=dt;p.position.addScaledVector(p.userData.v,dt);p.userData.v.y-=9*dt;if(p.userData.life<=0){p.geometry.dispose();s.group.remove(p);}}if(!s.group.children.length){world.remove(s.group);scenery.splice(i,1);}}}
 updateHud();
}
function animate(time){requestAnimationFrame(animate);const dt=Math.min(.04,(time-lastTime)/1000||.016);lastTime=time;update(dt,time);if(engineOsc)engineOsc.frequency.setTargetAtTime(70+Math.abs(speed)*5, audioCtx.currentTime,.08);renderer.render(scene,camera);}

function renderGarage(){const list=$('#carList');list.innerHTML='';cars.forEach((car,i)=>{const b=document.createElement('button');b.className='car-option'+(i===selectedCar?' active':'');b.innerHTML=`<div class="car-swatch" style="--swatch:#${car.color.toString(16).padStart(6,'0')}"></div><strong>${car.name}</strong><small>${car.type}</small>`;b.onclick=()=>{selectedCar=i;createCar(i);resetCar(false);$('#carNamePreview').textContent=car.name;renderGarage();};list.appendChild(b);});
 const locList=$('#locationList');locList.innerHTML='';const palettes={test:'linear-gradient(125deg,#737869,#41463e)',desert:'linear-gradient(120deg,#d9a86f,#815d3c)',forest:'linear-gradient(120deg,#819267,#263e34)',city:'linear-gradient(120deg,#849398,#363b40)'};locations.forEach(loc=>{const b=document.createElement('button');b.className='loc-option'+(loc.id===selectedLocation?' active':'');b.style.setProperty('--loc',palettes[loc.id]);b.innerHTML=`<span>${loc.name}</span><small>${loc.desc}</small>`;b.onclick=()=>{startLocation(loc.id);renderGarage();};locList.appendChild(b);});}
function toggleGarage(force){menuOpen=force??!menuOpen;$('#garagePanel').classList.toggle('open',menuOpen);if(menuOpen)playing=false;else if(!$('#startScreen').classList.contains('hidden'))playing=false;else playing=true;}
$('#startBtn').addEventListener('click',()=>{$('#startScreen').classList.add('hidden');playing=true;});
$('#closeStart').addEventListener('click',()=>{$('#startScreen').classList.add('hidden');playing=true;});
$('#menuBtn').addEventListener('click',()=>toggleGarage());$('#closeGarage').addEventListener('click',()=>toggleGarage(false));$('#driveBtn').addEventListener('click',()=>toggleGarage(false));
$('#resetBtn').addEventListener('click',()=>resetCar(true));
window.addEventListener('keydown',e=>{keys[e.code]=true;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='KeyR'){resetCar(true);}if(e.code==='Escape')toggleGarage();});window.addEventListener('keyup',e=>{keys[e.code]=false;});window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;steer=0;throttle=0;braking=false;handbrake=false;});
for(const button of document.querySelectorAll('[data-control]')){const name=button.dataset.control;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(name==='left')steer=-1;if(name==='right')steer=1;if(name==='gas')throttle=1;if(name==='brake')braking=true;});const release=e=>{e.preventDefault();if(name==='left'&&steer<0)steer=0;if(name==='right'&&steer>0)steer=0;if(name==='gas')throttle=0;if(name==='brake')braking=false;};button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);}
let audioCtx=null,engineOsc=null,engineGain=null;$('#soundBtn').addEventListener('click',()=>{if(!audioCtx){audioCtx=new AudioContext();engineOsc=audioCtx.createOscillator();engineGain=audioCtx.createGain();engineOsc.type='sawtooth';engineOsc.frequency.value=80;engineGain.gain.value=.028;engineOsc.connect(engineGain);engineGain.connect(audioCtx.destination);engineOsc.start();}const muted=engineGain.gain.value>0;engineGain.gain.setTargetAtTime(muted?0:.028,audioCtx.currentTime,.08);$('#soundBtn').style.color=muted?'#c2c9bd':'var(--lime)';$('#soundBtn').setAttribute('aria-label',muted?'Включить звук':'Выключить звук');if(audioCtx.state==='suspended')audioCtx.resume();});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));});
renderGarage();buildWorld(selectedLocation);createCar(selectedCar);resetCar(false);$('#carNamePreview').textContent=cars[selectedCar].name;camera.position.set(0,5,-10);camera.lookAt(0,1,0);requestAnimationFrame(animate);

