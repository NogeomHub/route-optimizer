import test from 'node:test';
import assert from 'node:assert/strict';
import {AuditedTollPricingProvider} from '../pricing/provider.mjs';
import {resolveOfficialStation} from '../pricing/generic-aprr.mjs';
test('reviewed OSM station names map to official APRR names',()=>{
  const names=['PONT D AIN','CHALON SUD','AMBERIEU'];
  assert.equal(resolveOfficialStation("Pont-d'Ain",names),'PONT D AIN');
  assert.equal(resolveOfficialStation('Ambérieu-en-Bugey',names),'AMBERIEU');
  assert.equal(resolveOfficialStation('Unrelated Plaza',names),null);
});
test('full official matrix exposes Pont d Ain to Chalon Sud at 10.70 EUR',()=>{
  const p=new AuditedTollPricingProvider();
  const q=p.quote({operator:'APRR',system:'closed',entry:"Pont d'Ain",exit:'Chalon Sud',mappingConfidence:'reviewed',tariffSource:'generated_aprr_matrix',evidence:[]},{on:'2026-11-02',vehicleClass:1,profile:'standard'});
  assert.equal(q.status,'verified'); assert.equal(q.cents,1070);
  const old=p.quote({operator:'APRR',system:'closed',entry:'AMBERIEU',exit:'LES EPRUNES',mappingConfidence:'reviewed',evidence:[]},{on:'2026-10-30',vehicleClass:1,profile:'standard'});
  assert.equal(old.cents,4070); assert.equal(old.sourceVerifiedAt,'2026-10-30');
});
