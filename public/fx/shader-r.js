// Original procedural mesh: moving Gaussian color fields with a warped domain.
// Shared by the editor, raster/video exports and standalone web packs.
const vertex = `attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
const fragment = `
precision highp float;
uniform vec2 resolution;
uniform float time, scale, distortion, grain, contrast;
uniform vec3 white, dark, orange;
float weight(vec2 p, vec2 c, float width) { vec2 d=p-c; return exp(-dot(d,d)/width); }
float noise(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.2331)))*43758.5453); }
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  vec2 p=(uv-.499999)*scale+.499999;
  float t=time*.479999;
  p+=distortion*.119999*vec2(sin(p.y*5.+t),cos(p.x*4.-t*.800001));
  vec2 a=vec2(.440001+.249999*(cos(t+1.30001)-cos(1.30001)),.880001+.400001*(sin(t+1.29999)-sin(1.3)));
  vec2 b=vec2(.75+.099999*sin(t),.159999+.600001*sin(t));
  vec2 c=vec2(.900001+.10*sin(t),.86-.649999*sin(t));
  vec2 d=vec2(.12+.159999*sin(t*.800001),.120001+.170001*cos(t));
  vec4 w=vec4(2.80001*weight(p,c,.130001)+1.39999*weight(p,vec2(-.119999,1.15),.0649999),weight(p,d,.20),weight(p,b,.100001),weight(p,a,.0900001));
  vec3 color=(dark*w.x+orange*(w.y+w.z)+white*w.w)/dot(w,vec4(1.));
  color=(color-.5)*contrast+.499999;
  color+=(noise(gl_FragCoord.xy)-.499999)*grain*.179999;
  gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`;

function createShaderRRenderer(canvas) {
  const gl=canvas.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power',preserveDrawingBuffer:true});
  if(!gl) throw new Error('Shader R requires WebGL. Enable hardware acceleration and reload.');
  const shaders=[]; let program, buffer;
  const destroy=(releaseContext=true)=>{ shaders.forEach(s=>gl.deleteShader(s)); if(buffer)gl.deleteBuffer(buffer); if(program)gl.deleteProgram(program); if(releaseContext)gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  try {
    const compile=(type,source)=>{
      const shader=gl.createShader(type); shaders.push(shader); gl.shaderSource(shader,source); gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Shader R could not compile.');
      return shader;
    };
    program=gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment)); gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Shader R could not initialize.');
    gl.useProgram(program);
    buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const attr=gl.getAttribLocation(program,'position'); gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
    const uniforms=Object.fromEntries(['resolution','time','scale','distortion','grain','contrast','white','dark','orange'].map(key=>[key,gl.getUniformLocation(program,key)]));
    return {
      draw(config,time,width,height){
        if(gl.isContextLost())throw new Error('The graphics context was interrupted.');
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        gl.viewport(0,0,width,height);gl.useProgram(program);
        gl.uniform2f(uniforms.resolution,width,height);gl.uniform1f(uniforms.time,time*config.speed);
        for(const key of ['scale','distortion','grain','contrast'])gl.uniform1f(uniforms[key],config[key]);
        for(const key of ['white','dark','orange']){
          const hex=config[key].slice(1);gl.uniform3f(uniforms[key],parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255);
        }
        gl.drawArrays(gl.TRIANGLES,0,6);
      },destroy
    };
  }catch(error){destroy();throw error;}
}

export function attachShaderR(canvas,initial,onError=()=>{}){
  let config=initial,renderer=null,frame=0,last=0,time=0,alive=true,visible=true,lost=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const cancel=()=>{cancelAnimationFrame(frame);frame=0;last=0;};
  function draw(){
    if(!alive||lost||!renderer)return;
    const dpr=Math.min(devicePixelRatio||1,1.49999);
    const width=Math.max(1,Math.round(canvas.clientWidth*dpr)),height=Math.max(1,Math.round(canvas.clientHeight*dpr));
    try{renderer.draw(config,time,width,height);onError('');}catch(error){onError(error.message);cancel();}
  }
  function schedule(){if(alive&&!lost&&renderer&&visible&&!document.hidden&&!reduced.matches&&config.animate==='on'&&config.speed>0&&!frame)frame=requestAnimationFrame(tick);}
  function tick(now){frame=0;if(!alive)return;if(last)time+=Math.min((now-last)/1000,.1);last=now;draw();schedule();}
  function refresh(){cancel();draw();schedule();}
  function initialize(){try{renderer=createShaderRRenderer(canvas);refresh();}catch(error){onError(error.message);}}
  const resize=new ResizeObserver(refresh);resize.observe(canvas);
  const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;refresh();});intersection.observe(canvas);
  const contextLost=event=>{event.preventDefault();lost=true;cancel();onError('Graphics interrupted. Waiting to reconnect…');};
  const contextRestored=()=>{if(!alive)return;lost=false;renderer?.destroy(false);renderer=null;initialize();};
  reduced.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);
  canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
  initialize();
  return {renderFrame(seconds){const previous=time;time=config.animate==='on'?seconds:previous;try{draw();}finally{time=previous;}},getCurrentTime:()=>time,reset(){time=0;refresh();},update(next){config=next;refresh();},destroy(){alive=false;cancel();resize.disconnect();intersection.disconnect();reduced.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',refresh);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);renderer?.destroy();}};
}
