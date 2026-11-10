import { test } from 'node:test';
import assert from 'node:assert/strict';
const geometry = await import(new URL('../web/dome-geometry.js', import.meta.url).href);
const { project3D, moveOnFloor, trajectoryPoint, arcPoint, networkLayout } = geometry;
test('3D camera rotates and foreshortens world geometry without changing coordinates', () => {
  const point = {x:180,y:60,z:90}, before = {...point};
  const front = project3D(point,{yaw:0,pitch:.5,zoom:1});
  const turned = project3D(point,{yaw:Math.PI/2,pitch:.5,zoom:1});
  assert.notEqual(front.x,turned.x);assert.notEqual(front.depth,turned.depth);
  assert.deepEqual(point,before);
  assert.ok(project3D({x:100,y:0,z:200},{yaw:0,pitch:.5,zoom:1}).scale < project3D({x:100,y:0,z:-200},{yaw:0,pitch:.5,zoom:1}).scale);
  for(let i=0;i<100;i++) for(const yaw of [-3,0,3]){
    const p=project3D({x:330*Math.cos(i),z:330*Math.sin(i),y:265},{yaw,pitch:1.15,zoom:1.7});
    assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.scale>0);
  }
});
test('floor dragging changes world positions at multiple camera angles, without mutating the network', () => {
  const network={count:5,edges:[{from:4,to:0},{from:4,to:1},{from:4,to:2},{from:4,to:3}]};
  const saved=structuredClone(network),anchors=networkLayout(network.count,network.edges);
  assert.deepEqual(anchors[4],{x:0,y:100,z:0});
  for(const yaw of [0,.8,2]){
    const original={x:0,z:0},camera={yaw,pitch:.58,zoom:1};
    const moved=moveOnFloor(original,20,15,camera);
    const a=project3D({...original,y:0},camera),b=project3D({...moved,y:0},camera);
    assert.ok(b.x>a.x&&b.y>a.y);assert.deepEqual(original,{x:0,z:0});
  }
  assert.deepEqual(network,saved);
  const pipeline=networkLayout(5,[{from:0,to:1},{from:1,to:2},{from:2,to:3},{from:3,to:4}]);
  assert.ok(pipeline.every((p:{x:number},i:number)=>i===0||p.x>pipeline[i-1].x));
  assert.equal(networkLayout(100,[]).length,100);
});
test('trajectories remain above the floor and communication arcs meet their recorded endpoints', () => {
  const anchor={x:120,z:-80},from=trajectoryPoint(anchor,0),to=trajectoryPoint(anchor,1);
  for(let i=0;i<=100;i++){
    const p=trajectoryPoint(anchor,i/100);assert.ok(p.y>=0);assert.ok(Math.hypot(p.x-anchor.x,p.z-anchor.z)<=65.001);
  }
  assert.deepEqual(arcPoint(from,to,0),from);
  const end=arcPoint(from,to,1);
  assert.ok(Math.abs(end.x-to.x)<1e-8&&Math.abs(end.y-to.y)<1e-8&&Math.abs(end.z-to.z)<1e-8);
  assert.ok(arcPoint(from,to,.5).y>Math.max(from.y,to.y));
  assert.equal(trajectoryPoint({...anchor,y:100},0).y,from.y+100);
  assert.deepEqual(trajectoryPoint(anchor,-1),from);assert.deepEqual(trajectoryPoint(anchor,2),to);
});
