import React, { useEffect, useState } from 'react';
import { Alert, AlertButton, Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

type Notice={title:string;message?:string;buttons:AlertButton[]};
let present:((notice:Notice)=>void)|undefined;
const pending:Notice[]=[];

// React Native Alert has no web implementation. Preserve confirmation callbacks.
export function operatorAlert(title:string,message?:string,buttons?:AlertButton[]){
  if(Platform.OS!=='web'){Alert.alert(title,message,buttons);return;}
  const notice={title,message,buttons:buttons?.length?buttons:[{text:'Aceptar'}]};
  if(present)present(notice);else pending.push(notice);
}

export default function OperatorAlert(){
  const [queue,setQueue]=useState<Notice[]>([]);
  useEffect(()=>{
    const show=(notice:Notice)=>setQueue(items=>items.some(item=>item.title===notice.title&&item.message===notice.message)?items:[...items,notice]);
    present=show;pending.splice(0).forEach(show);
    return()=>{if(present===show)present=undefined;};
  },[]);
  if(Platform.OS!=='web'||!queue.length)return null;
  const notice=queue[0];
  const choose=(button:AlertButton)=>{
    setQueue(items=>items.slice(1));button.onPress?.();
  };
  return <Modal visible transparent animationType="fade" onRequestClose={()=>{
    const cancel=notice.buttons.find(button=>button.style==='cancel');
    if(cancel)choose(cancel);else if(notice.buttons.length===1)choose(notice.buttons[0]);
  }}><View style={{flex:1,backgroundColor:'rgba(0,0,0,.5)',alignItems:'center',justifyContent:'center',padding:20}}><View accessibilityViewIsModal style={{width:'100%',maxWidth:440,maxHeight:'85%',backgroundColor:'#FFF',padding:22,borderRadius:20}}>
    <Text accessibilityRole="header" style={{fontSize:20,fontWeight:'800',marginBottom:12}}>{notice.title}</Text>
    {!!notice.message&&<ScrollView><Text style={{fontSize:15,lineHeight:22}}>{notice.message}</Text></ScrollView>}
    <View style={{gap:8,marginTop:18}}>{notice.buttons.map((button,index)=><TouchableOpacity accessibilityRole="button" key={index} onPress={()=>choose(button)} style={{minHeight:48,padding:14,borderRadius:12,backgroundColor:button.style==='cancel'?'#EEE':button.style==='destructive'?'#BD2626':'#FF7733'}}><Text style={{textAlign:'center',fontWeight:'700',color:button.style==='cancel'?'#222':'#FFF'}}>{button.text||'Aceptar'}</Text></TouchableOpacity>)}</View>
  </View></View></Modal>;
}
