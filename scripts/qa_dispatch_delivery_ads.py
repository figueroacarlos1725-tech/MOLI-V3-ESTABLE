"""Local API regression for dispatch, delivery and advertising.
Requires QA_MONGO_URL, QA_SUPERVISOR_PIN; optional QA_BASE_URL, QA_DB_NAME.
Only synthetic accounts are provisioned in the isolated QA database.
No payment provider is invoked. Installs: requests, pymongo.
"""
import json, os, pathlib, secrets, time
from urllib.parse import urlparse
import requests, pymongo
root=pathlib.Path(__file__).parent
base=os.environ.get('QA_BASE_URL','http://localhost:8091/api').rstrip('/')
database=os.environ.get('QA_DB_NAME','moli_fix_qa')
if not database.endswith('_qa') or urlparse(base).hostname not in {'localhost','127.0.0.1'}:
    raise SystemExit('This test provisions QA identities. Use a local QA backend and a database ending _qa.')
db=pymongo.MongoClient(os.environ['QA_MONGO_URL'])[database]
pin=os.environ['QA_SUPERVISOR_PIN']
run=str(int(time.time())); results=[]
def call(method,path,a=None,body=None,expected=200,key=None):
    h={'Authorization':'Bearer '+a['access_token']} if a else {}
    if key:h['Idempotency-Key']=key
    r=requests.request(method,base+path,headers=h,json=body,timeout=90)
    assert r.status_code==expected,f'{method} {path}: {r.status_code} {r.text[:200]}'
    return r.json()
def account(kind,role='rider'):
    a=call('POST','/auth/register',body={'email':f'qa.extra.{kind}.{run}@moli.example.com','name':'QA '+kind,'password':secrets.token_urlsafe(20),'phone':'+5493834000000','user_type':'driver' if role=='driver' else 'rider'})
    if role in ['admin','dispatcher']:db.users.update_one({'user_id':a['user']['user_id']},{'$set':{'user_type':role}})
    return a
def passed(label):results.append(label);print('PASS '+label,flush=True)
c=account('cliente');a=account('admin','admin');d=account('despacho','dispatcher');m=account('comercio');p=account('conductor','driver');other=account('otro','driver')
for who in [c,p]:call('GET','/dispatch/rides',who,expected=403)
for who in [a,d]:call('GET','/dispatch/rides',who)
call('GET','/admin/ads/campaigns',d,expected=403)
passed('permisos despacho admin/dispatcher; cliente/conductor rechazados; dispatcher no administra campañas')
call('POST','/vehicles',p,{'make':'QA','model':'Moto','year':2023,'color':'Naranja','plate_number':'QA'+run,'vehicle_type':'motorcycle','capacity':1})
call('PUT','/drivers/availability?is_online=true&latitude=-28.4696&longitude=-65.7852',p)
rq=call('POST','/rides/request',c,{'pickup_location':{'latitude':-36,'longitude':-69,'address':'QA origen'},'dropoff_location':{'latitude':-36.01,'longitude':-69.01,'address':'QA destino'},'vehicle_type':'motorcycle','payment_method':'cash','ride_type':'standard'})
rid=rq['request_id']; body={'driver_id':p['user']['user_id'],'pin':pin}
call('POST',f'/dispatch/assign/{rid}',c,body,403)
call('POST',f'/dispatch/assign/{rid}',d,{**body,'pin':'incorrecto'},403)
assigned=call('POST',f'/dispatch/assign/{rid}',d,body)
assert db.rides.find_one({'request_id':rid})['driver_id']==p['user']['user_id']
call('POST',f'/dispatch/assign/{rid}',d,body,409)
passed('asignacion manual dispatcher con PIN; cliente/PIN incorrecto bloqueados y reasignacion409')
# Separate ride fixture from delivery availability.
db.drivers.update_one({'driver_id':p['user']['user_id']},{'$set':{'is_available':True,'is_online':True}})
merchant=call('POST','/marketplace/merchants',m,{'name':'QA delivery '+run,'address':'QA comercio','latitude':-28.4696,'longitude':-65.7852})
mid=merchant['merchant_id'];call('PUT',f'/marketplace/admin/merchants/{mid}/approval',a,{'approved':True,'delivery':True,'pickup':True,'delivery_fee_cents':50000})
product=call('POST','/marketplace/products',m,{'name':'QA entrega','price_cents':100000,'stock':5})
call('PUT','/marketplace/cart/items',c,{'product_id':product['product_id'],'quantity':1})
order=call('POST','/marketplace/orders',c,{'fulfilment':'delivery','payment_method':'cash','delivery_address':'QA privada','delivery_latitude':-28.48,'delivery_longitude':-65.79},key='extra-'+run)
oid=order['order_id']
for status in ['accepted','preparing','ready']:call('PUT',f'/marketplace/orders/{oid}/status',m,{'status':status})
call('POST',f'/marketplace/orders/{oid}/dispatch',c,{},403)
delivery=call('POST',f'/marketplace/orders/{oid}/dispatch',d,{})
did=delivery['delivery_id'];assert delivery['offers']
cards=call('GET','/marketplace/deliveries/driver/inbox',p)['deliveries'];card=next(x for x in cards if x['delivery_id']==did)
assert 'address' not in card['destination']
call('POST',f'/marketplace/deliveries/{did}/accept',c,{},403)
call('POST',f'/marketplace/deliveries/{did}/accept',p,{})
cards=call('GET','/marketplace/deliveries/driver/inbox',p)['deliveries'];assert next(x for x in cards if x['delivery_id']==did)['destination']['address']=='QA privada'
call('PUT',f'/marketplace/deliveries/{did}/status',other,{'status':'picked_up'},404)
call('PUT',f'/marketplace/deliveries/{did}/status',p,{'status':'completed'},409)
for status in ['picked_up','delivering','completed']:call('PUT',f'/marketplace/deliveries/{did}/status',p,{'status':status})
assert call('GET',f'/marketplace/orders/{oid}',c)['status']=='completed'
passed('delivery ofreciendo/asignada/retirada/en camino/completada; direccion privada antes; tercero y salto de estado rechazados')
campaign=call('POST','/admin/ads/campaigns',a,{'name':'QA campaña '+run,'targeting':{'roles':['rider'],'surfaces':['marketplace'],'triggers':['marketplace_open']},'frequency':{'max_per_user_total':1,'max_per_user_day':1,'max_per_session':1,'cooldown_seconds':0,'once_per_entity':True},'close_policy':{'countdown_seconds':5},'creatives':[{'format':'image','media_url':'https://example.com/qa.png','destination':{'type':'marketplace_store','merchant_id':mid}}]})['campaign']
cid=campaign['campaign_id'];call('POST',f'/admin/ads/campaigns/{cid}/state',a,{'state':'active'})
payload={'trigger':'marketplace_open','surface':'marketplace','entity_type':'merchant','entity_id':mid,'session_id':'qa-'+run}
ad=call('POST','/ads/decision',c,payload)['delivery'];assert ad and ad['campaign_id']==cid and ad['close_policy']['countdown_seconds']==5
assert call('POST','/ads/decision',p,payload)['delivery'] is None
eid='event-'+run;event={'client_event_id':eid,'type':'viewable'}
call('POST',f'/ads/deliveries/{ad["delivery_id"]}/events',other,event,404)
call('POST',f'/ads/deliveries/{ad["delivery_id"]}/events',c,event)
assert call('POST',f'/ads/deliveries/{ad["delivery_id"]}/events',c,event)['status']=='duplicate'
assert db.ad_campaigns.find_one({'campaign_id':cid})['impression_count']==1
assert call('POST','/ads/decision',c,{**payload,'session_id':'otra-'+run})['delivery'] is None
call('POST','/ads/decision',c,{**payload,'entity_id':'inexistente'},403)
call('POST',f'/admin/ads/campaigns/{cid}/state',a,{'state':'paused'})
passed('campaña targeting/close5s/destino tienda; frecuencia1; eventos idempotentes; tercero y entidad falsa rechazados')
(root/'qa-dispatch-delivery-ads-results.json').write_text(json.dumps({'database':database,'run':run,'passed':results},indent=2))
