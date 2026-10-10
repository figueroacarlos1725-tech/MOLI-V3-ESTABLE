import asyncio, concurrent.futures, json, os, pathlib, secrets, time
import requests, pymongo, websockets
root=pathlib.Path(__file__).parent
base=os.getenv('TEST_QA_API', 'http://localhost:8091/api')
qa_db=os.getenv('TEST_QA_DB', 'moli_fix_qa')
assert qa_db.startswith('moli_') and 'qa' in qa_db, 'Use only an isolated QA database'
db=pymongo.MongoClient(os.environ['TEST_QA_MONGO_URL'])[qa_db]
run=str(int(time.time())); results=[]
def call(method,path,a=None,body=None,expected=200,key=None):
    h={'Authorization':'Bearer '+a['access_token']} if a else {}
    if key:h['Idempotency-Key']=key
    r=requests.request(method,base+path,headers=h,json=body,timeout=120)
    assert r.status_code==expected,f'{method} {path}: {r.status_code} {r.text[:300]}'
    return r.json()
def account(kind,role='rider'):
    return call('POST','/auth/register',body={'email':f'qa.fix.{kind}.{run}@moli.example.com','name':'QA Fix '+kind,'password':secrets.token_urlsafe(20),'user_type':role,'phone':'+5493834000000','is_professional':role=='driver'})
def passed(s):results.append(s);print('PASS '+s,flush=True)
c=account('cliente');m=account('comercio');other=account('otro');admin=account('admin');pro=account('prestador','driver')
db.users.update_one({'user_id':admin['user']['user_id']},{'$set':{'user_type':'admin'}})
merchant=call('POST','/marketplace/merchants',m,{'name':'QA stock '+run,'address':'Ficticia','latitude':-28.4696,'longitude':-65.7852,'transfer_alias':'qa.ficticio'})
call('PUT',f'/marketplace/admin/merchants/{merchant["merchant_id"]}/approval',admin,{'approved':True,'pickup':True,'delivery':True,'delivery_fee_cents':50000})
p=call('POST','/marketplace/products',m,{'name':'QA producto','price_cents':150000,'stock':10})
pid=p['product_id']
call('PUT','/marketplace/cart/items',c,{'product_id':pid,'quantity':2})
o=call('POST','/marketplace/orders',c,{'fulfilment':'pickup','payment_method':'cash'},key='first-'+run)
assert db.marketplace_products.find_one({'product_id':pid})['stock']==8
repeat=call('POST','/marketplace/orders',c,{'fulfilment':'pickup','payment_method':'cash'},key='first-'+run)
assert repeat['order_id']==o['order_id'] and db.marketplace_products.find_one({'product_id':pid})['stock']==8
oid=o['order_id'];call('PUT',f'/marketplace/orders/{oid}/status',c,{'status':'accepted'},403)
call('PUT',f'/marketplace/orders/{oid}/status',other,{'status':'accepted'},403)
for status in ['accepted','preparing','ready']:call('PUT',f'/marketplace/orders/{oid}/status',m,{'status':status})
call('PUT',f'/marketplace/orders/{oid}/status',c,{'status':'completed'})
passed('checkout descuenta stock; repeticion idempotente; cliente/tercero no aceptan; retiro cliente completo')
call('PUT','/marketplace/cart/items',c,{'product_id':pid,'quantity':3})
o=call('POST','/marketplace/orders',c,{'fulfilment':'pickup','payment_method':'cash'},key='cancel-'+run)
assert db.marketplace_products.find_one({'product_id':pid})['stock']==5
call('PUT',f'/marketplace/orders/{o["order_id"]}/status',c,{'status':'cancelled'})
assert db.marketplace_products.find_one({'product_id':pid})['stock']==8
call('PUT',f'/marketplace/orders/{o["order_id"]}/status',c,{'status':'cancelled'},403)
assert db.marketplace_products.find_one({'product_id':pid})['stock']==8
passed('cancelar pedido pendiente reintegra stock una sola vez')
call('PUT','/marketplace/cart/items',c,{'product_id':pid,'quantity':1})
rejected=call('POST','/marketplace/orders',c,{'fulfilment':'pickup','payment_method':'cash'},key='reject-'+run)
call('PUT',f'/marketplace/orders/{rejected["order_id"]}/status',m,{'status':'rejected'})
assert db.marketplace_products.find_one({'product_id':pid})['stock']==8
call('PUT',f'/marketplace/orders/{rejected["order_id"]}/status',m,{'status':'rejected'},409)
assert db.marketplace_products.find_one({'product_id':pid})['stock']==8
passed('rechazar pedido reintegra stock una sola vez')
for a in [c,other]:call('PUT','/marketplace/cart/items',a,{'product_id':pid,'quantity':6})
def race(a):
    r=requests.post(base+'/marketplace/orders',headers={'Authorization':'Bearer '+a['access_token'],'Idempotency-Key':'race-'+run},json={'fulfilment':'pickup','payment_method':'cash'},timeout=120)
    return r.status_code
with concurrent.futures.ThreadPoolExecutor(2) as ex:codes=list(ex.map(race,[c,other]))
assert sorted(codes)==[200,409],codes
assert db.marketplace_products.find_one({'product_id':pid})['stock']==2
passed('checkout concurrente no sobrevende ni stock negativo')
call('PUT','/marketplace/cart/items',c,{'product_id':pid,'quantity':1})
def repeat_race(_):
    return call('POST','/marketplace/orders',c,{'fulfilment':'pickup','payment_method':'cash'},key='same-key-'+run)['order_id']
with concurrent.futures.ThreadPoolExecutor(2) as ex:repeated_ids=list(ex.map(repeat_race,[1,2]))
assert repeated_ids[0]==repeated_ids[1] and db.marketplace_products.find_one({'product_id':pid})['stock']==1
passed('misma idempotency key concurrente genera un pedido y una reserva')
call('PUT','/jobs/professional/profile',pro,{'categories':['electricista','tramites'],'is_available':True})
j=call('POST','/jobs/post',c,{'category':'electricista','title':'QA Chat','description':'Ficticio','budget':15000,'address':'Direccion ficticia','location':{'latitude':-28.4696,'longitude':-65.7852}})['job']['job_id']
call('POST','/chat/job/send',pro,{'job_id':j,'message':'antes'},403)
call('POST',f'/jobs/{j}/review',pro,{})
call('POST',f'/jobs/{j}/accept',pro,{})
call('POST','/chat/job/send',other,{'job_id':j,'message':'intruso'},403)
call('GET',f'/chat/job/{j}',other,expected=403)
call('POST','/chat/messages',other,{'receiver_id':c['user']['user_id'],'message':'intruso'},403)
async def realtime():
    wsbase=base.replace('https://','wss://').replace('http://','ws://')+'/ws/'
    for url in [wsbase+c['user']['user_id'],wsbase+c['user']['user_id']+'?token='+other['access_token']]:
        try:
            async with websockets.connect(url):raise AssertionError('Unauthorized websocket accepted')
        except websockets.exceptions.InvalidStatus:pass
    async with websockets.connect(wsbase+pro['user']['user_id']+'?token='+pro['access_token']) as ws:
        await ws.send(json.dumps({'type':'ping'}));assert json.loads(await ws.recv())['type']=='pong'
        sent=await asyncio.to_thread(call,'POST','/chat/job/send',c,{'job_id':j,'message':'Llegare a las 10. Contacto prueba@example.com +5493834123456'})
        event=json.loads(await asyncio.wait_for(ws.recv(),5))
        assert event['type']=='new_message' and event['job_id']==j
        assert event['message_id']==sent['message']['message_id']
        assert 'prueba@example.com' not in event['message'] and '+5493834123456' not in event['message']
        await ws.send(json.dumps({'type':'chat_message','receiver_id':other['user']['user_id'],'message':'bypass'}))
        assert json.loads(await ws.recv())['type']=='error'
        answer=await asyncio.to_thread(call,'POST','/chat/job/send',pro,{'job_id':j,'message':'Confirmado, voy en camino'})
        history=await asyncio.to_thread(call,'GET',f'/chat/job/{j}',c)
        assert len(history['messages'])==2 and history['messages'][1]['message_id']==answer['message']['message_id']
asyncio.run(realtime())
passed('chat realtime dos participantes, IDs canonicos, historial, redaccion; tercero y WS anonimo/suplantado bloqueados')
call('PUT',f'/jobs/{j}/status',pro,{'status':'in_progress'})
call('PUT',f'/jobs/{j}/status',pro,{'status':'mark_completed'})
call('PUT',f'/jobs/{j}/status',c,{'status':'confirm_completed'})
call('POST','/chat/job/send',c,{'job_id':j,'message':'despues'},409)
assert len(call('GET',f'/chat/job/{j}',c)['messages'])==2
passed('servicio terminado bloquea nuevos mensajes y conserva historial autorizado')
print(json.dumps({'database':qa_db,'run':run,'passed':results},indent=2))
