import test from 'node:test';
import assert from 'node:assert/strict';
import {AuditedTollPricingProvider} from '../pricing/provider.mjs';
import {loadAprrBooths, resolveOfficialStation} from '../pricing/generic-aprr.mjs';
import {distance} from '../src/geometry.mjs';

const encode = (points) => {
  let previousLat = 0, previousLon = 0, out = '';
  const part = (delta) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    let text = '';
    while (value >= 0x20) {
      text += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    return text + String.fromCharCode(value + 63);
  };
  for (const [lon, lat] of points) {
    const nextLat = Math.round(lat * 1e6), nextLon = Math.round(lon * 1e6);
    out += part(nextLat - previousLat) + part(nextLon - previousLon);
    previousLat = nextLat; previousLon = nextLon;
  }
  return out;
};

test('reviewed OSM station names map to official APRR names',()=>{
  const names=['PONT D AIN','CHALON SUD','AMBERIEU'];
  assert.equal(resolveOfficialStation("Pont-d'Ain",names),'PONT D AIN');
  assert.equal(resolveOfficialStation('Ambérieu-en-Bugey',names),'AMBERIEU');
  assert.equal(resolveOfficialStation('Unrelated Plaza',names),null);
});

test('reviewed APRR station snapshot uses the actual Pont d Ain and Chalon Sud plazas',()=>{
  const booths=loadAprrBooths().booths;
  const pont=booths.find((b)=>b.name==="Pont-d'Ain");
  const chalon=booths.find((b)=>b.name==='Chalon Sud');
  assert.deepEqual([pont.osm_id,pont.lon,pont.lat],[84428307,5.3278855,46.0481257]);
  assert.deepEqual([chalon.osm_id,chalon.lon,chalon.lat],[2385481455,4.83325,46.75557]);
});

test('full official matrix exposes Pont d Ain to Chalon Sud at 10.70 EUR',()=>{
  const p=new AuditedTollPricingProvider();
  const q=p.quote({operator:'APRR',system:'closed',entry:"Pont d'Ain",exit:'Chalon Sud',mappingConfidence:'reviewed',tariffSource:'generated_aprr_matrix',evidence:[]},{on:'2026-11-02',vehicleClass:1,profile:'standard'});
  assert.equal(q.status,'verified'); assert.equal(q.cents,1070);
  const old=p.quote({operator:'APRR',system:'closed',entry:'AMBERIEU',exit:'LES EPRUNES',mappingConfidence:'reviewed',evidence:[]},{on:'2026-10-30',vehicleClass:1,profile:'standard'});
  assert.equal(old.cents,4070); assert.equal(old.sourceVerifiedAt,'2026-10-30');
});

test('generic APRR matching prices a route crossing Pont d Ain and Chalon Sud', async()=>{
  const points=[[5.3278855,46.0481257],[5.0,46.4],[4.83325,46.75557]];
  const shape=encode(points);
  const km=distance(points[0],points[1])+distance(points[1],points[2]);
  const provider=new AuditedTollPricingProvider();
  const result=await provider.priceRoute({
    route:{distanceKm:km,geometry:{type:'LineString',coordinates:points}},
    trace:{units:'kilometers',shape,edges:[{toll:true,length:km,begin_shape_index:0,end_shape_index:2,names:['A 40','A 6']}]},
    origin:{lon:points[0][0],lat:points[0][1]},
    destination:{lon:points[2][0],lat:points[2][1]},
    on:'2026-11-02',vehicleClass:1,profile:'standard',context:{}
  });
  assert.equal(result.status,'complete_verified');
  assert.equal(result.totalCents,1070);
  assert.equal(result.scope,'generic-aprr-2026');
});
