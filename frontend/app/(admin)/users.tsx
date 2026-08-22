import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '@/src/services/api';
import { confirmAlert } from '@/src/utils/alert';

interface User {
  user_id: string; name: string; email: string; phone?: string;
  user_type: string; balance: number; debt: number;
  is_online?: boolean; is_blocked?: boolean; priority?: number;
  commission_type?: string; commission_value?: number;
  block_type?: string; created_at?: string;
}

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceOp, setBalanceOp] = useState('set');
  const [balanceField, setBalanceField] = useState<'balance'|'debt'>('balance');
  const [newUser, setNewUser] = useState({name:'',email:'',phone:'',password:'',user_type:'rider'});
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [commType, setCommType] = useState('percentage');
  const [commValue, setCommValue] = useState('15');
  const [blockType, setBlockType] = useState('permanent');
  const [blockDuration, setBlockDuration] = useState('24');
  const [priority, setPriority] = useState('0');
  const [serviceTypes, setServiceTypes] = useState<string[]>(['economy']);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [showAudit, setShowAudit] = useState(false);

  useEffect(() => { fetchUsers(); }, [filter, search]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let url = '/admin/users?limit=50';
      if (filter) url += `&user_type=${filter}`;
      if (search) url += `&search=${search}`;
      const r = await apiService.get(url);
      setUsers(r.users || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchUserDetail = async (uid: string) => {
    try {
      const r = await apiService.get(`/admin/users/${uid}`);
      setSelectedUser(r);
      setEditName(r.name || '');
      setEditPhone(r.phone || '');
      setCommType(r.commission_type || 'percentage');
      setCommValue(String(r.commission_value || 15));
      setPriority(String(r.priority || 0));
      setServiceTypes(r.service_types || ['economy']);
      setShowModal(true);
    } catch (e) { console.error(e); }
  };

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) return;
    setSaving(true);
    try {
      await apiService.post('/admin/users', newUser);
      setShowCreateModal(false);
      setNewUser({name:'',email:'',phone:'',password:'',user_type:'rider'});
      fetchUsers();
    } catch (e: any) {
      const msg = Platform.OS === 'web' ? window.alert : Alert.alert;
      msg('Error', e.message || 'Error creando usuario');
    } finally { setSaving(false); }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiService.put(`/admin/users/${selectedUser.user_id}`, {name: editName, phone: editPhone});
      fetchUsers();
      fetchUserDetail(selectedUser.user_id);
    } catch (e) {} finally { setSaving(false); }
  };

  const handleBalance = async () => {
    if (!selectedUser || !balanceAmount) return;
    setSaving(true);
    try {
      const endpoint = balanceField === 'debt' ? 'debt' : 'balance';
      await apiService.put(`/admin/users/${selectedUser.user_id}/${endpoint}`, {
        amount: parseFloat(balanceAmount), operation: balanceOp, reason: 'Ajuste admin'
      });
      setShowBalanceModal(false);
      setBalanceAmount('');
      fetchUserDetail(selectedUser.user_id);
    } catch (e) {} finally { setSaving(false); }
  };

  const handleCommission = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiService.put(`/admin/drivers/${selectedUser.user_id}/commission`, {
        commission_type: commType, commission_value: parseFloat(commValue)
      });
      fetchUserDetail(selectedUser.user_id);
    } catch (e) {} finally { setSaving(false); }
  };

  const handleBlock = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiService.put(`/admin/drivers/${selectedUser.user_id}/block`, {
        block_type: blockType, block_duration: parseInt(blockDuration), reason: 'Admin'
      });
      fetchUserDetail(selectedUser.user_id);
    } catch (e) {} finally { setSaving(false); }
  };

  const handleUnblock = async () => {
    if (!selectedUser) return;
    try {
      await apiService.put(`/admin/drivers/${selectedUser.user_id}/unblock`, {});
      fetchUserDetail(selectedUser.user_id);
    } catch (e) {}
  };

  const handlePriority = async () => {
    if (!selectedUser) return;
    try {
      await apiService.put(`/admin/drivers/${selectedUser.user_id}/priority`, {priority: parseInt(priority)});
      fetchUserDetail(selectedUser.user_id);
    } catch (e) {}
  };

  const toggleServiceType = (type: string) => {
    setServiceTypes(prev => {
      if (prev.includes(type)) {
        if (prev.length <= 1) return prev; // at least 1
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
  };

  const handleSaveServices = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiService.put(`/admin/drivers/${selectedUser.user_id}/services`, {service_types: serviceTypes});
      fetchUserDetail(selectedUser.user_id);
    } catch (e) {} finally { setSaving(false); }
  };

  const fetchAuditLogs = async (uid: string) => {
    try {
      const r = await apiService.get(`/admin/audit-log?target_user_id=${uid}&limit=20`);
      setAuditLogs(r.logs || []);
      setShowAudit(true);
    } catch (e) {}
  };

  const UserCard = ({u}: {u: User}) => (
    <TouchableOpacity style={s.userCard} onPress={() => fetchUserDetail(u.user_id)}>
      <View style={s.userCardHeader}>
        <View style={[s.avatar, u.user_type==='driver'?s.avatarDriver:u.user_type==='admin'?s.avatarAdmin:s.avatarRider]}>
          <Ionicons name={u.user_type==='driver'?'car':u.user_type==='admin'?'shield':'person'} size={18} color="#fff" />
        </View>
        <View style={{flex:1}}>
          <Text style={s.userName}>{u.name}</Text>
          <Text style={s.userEmail}>{u.email}</Text>
        </View>
        <View style={{alignItems:'flex-end'}}>
          <View style={[s.badge, u.user_type==='driver'?s.badgeDriver:u.user_type==='admin'?s.badgeAdmin:s.badgeRider]}>
            <Text style={s.badgeText}>{u.user_type==='driver'?'Conductor':u.user_type==='admin'?'Admin':'Pasajero'}</Text>
          </View>
          {u.is_blocked && <Text style={s.blockedText}>BLOQUEADO</Text>}
          {u.is_online && <View style={s.onlineDot} />}
        </View>
      </View>
      <View style={s.userCardFooter}>
        <Text style={s.balanceText}>Saldo: ${u.balance?.toFixed(2)||'0.00'}</Text>
        {u.debt > 0 && <Text style={s.debtText}>Deuda: ${u.debt?.toFixed(2)}</Text>}
        {(u.priority||0) > 0 && <Text style={s.priorityText}>Prioridad: {u.priority}</Text>}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Gestión de Usuarios</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={s.addBtnText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={18} color="#8E8E93" />
          <TextInput style={s.searchInput} placeholder="Buscar..." value={search} onChangeText={setSearch} onSubmitEditing={fetchUsers} />
        </View>
      </View>

      <View style={s.filterRow}>
        {['','rider','driver','admin'].map(f => (
          <TouchableOpacity key={f} style={[s.filterBtn, filter===f&&s.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterBtnText, filter===f&&s.filterBtnTextActive]}>{f===''?'Todos':f==='rider'?'Pasajeros':f==='driver'?'Conductores':'Admin'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator size="large" color="#E85E1A" style={{marginTop:40}} /> :
        <ScrollView contentContainerStyle={s.list}>
          {users.map(u => <UserCard key={u.user_id} u={u} />)}
          {users.length === 0 && <Text style={s.emptyText}>No se encontraron usuarios</Text>}
        </ScrollView>
      }

      {/* User Detail Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>{selectedUser?.name}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color="#666" /></TouchableOpacity>
              </View>

              {selectedUser && <>
                <View style={s.section}>
                  <Text style={s.sectionTitle}>Información</Text>
                  <TextInput style={s.input} value={editName} onChangeText={setEditName} placeholder="Nombre" />
                  <TextInput style={s.input} value={editPhone} onChangeText={setEditPhone} placeholder="Teléfono" />
                  <Text style={s.infoRow}>Email: {selectedUser.email}</Text>
                  <Text style={s.infoRow}>Tipo: {selectedUser.user_type}</Text>
                  <TouchableOpacity style={s.saveBtn} onPress={handleUpdateUser} disabled={saving}>
                    <Text style={s.saveBtnText}>{saving?'Guardando...':'Guardar cambios'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.section}>
                  <Text style={s.sectionTitle}>Saldo y Deuda</Text>
                  <View style={s.balanceRow}>
                    <View style={s.balanceCard}>
                      <Text style={s.balanceLabel}>Saldo</Text>
                      <Text style={s.balanceValue}>${selectedUser.balance?.toFixed(2)}</Text>
                      <TouchableOpacity style={s.smallBtn} onPress={() => {setBalanceField('balance');setShowBalanceModal(true);}}>
                        <Text style={s.smallBtnText}>Modificar</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={s.balanceCard}>
                      <Text style={s.balanceLabel}>Deuda</Text>
                      <Text style={[s.balanceValue,{color:'#EF4444'}]}>${selectedUser.debt?.toFixed(2)}</Text>
                      <TouchableOpacity style={s.smallBtn} onPress={() => {setBalanceField('debt');setShowBalanceModal(true);}}>
                        <Text style={s.smallBtnText}>Modificar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {selectedUser.user_type === 'driver' && <>
                  <View style={s.section}>
                    <Text style={s.sectionTitle}>Tipos de Servicio</Text>
                    <Text style={{fontSize:12,color:'#8E8E93',marginBottom:10}}>Elegí qué servicios puede ofrecer este conductor</Text>
                    <View style={s.radioRow}>
                      {[{key:'economy',label:'Auto'},{key:'moto',label:'Moto'},{key:'comfort',label:'Confort'},{key:'premium',label:'Premium'},{key:'xl',label:'XL'}].map(t => (
                        <TouchableOpacity key={t.key} style={[s.serviceChip, serviceTypes.includes(t.key)&&s.serviceChipActive]} onPress={() => toggleServiceType(t.key)}>
                          <Ionicons name={serviceTypes.includes(t.key)?'checkmark-circle':'ellipse-outline'} size={18} color={serviceTypes.includes(t.key)?'#fff':'#8E8E93'} />
                          <Text style={[s.serviceChipText, serviceTypes.includes(t.key)&&{color:'#fff'}]}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity style={s.saveBtn} onPress={handleSaveServices} disabled={saving}>
                      <Text style={s.saveBtnText}>Guardar servicios</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.section}>
                    <Text style={s.sectionTitle}>Comisión</Text>
                    <View style={s.radioRow}>
                      {['percentage','fixed_per_ride','fixed_price'].map(t => (
                        <TouchableOpacity key={t} style={[s.radioBtn, commType===t&&s.radioBtnActive]} onPress={() => setCommType(t)}>
                          <Text style={[s.radioBtnText, commType===t&&s.radioBtnTextActive]}>{t==='percentage'?'%':t==='fixed_per_ride'?'$/viaje':'$ fijo'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TextInput style={s.input} value={commValue} onChangeText={setCommValue} keyboardType="numeric" placeholder="Valor" />
                    <TouchableOpacity style={s.saveBtn} onPress={handleCommission}>
                      <Text style={s.saveBtnText}>Guardar comisión</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.section}>
                    <Text style={s.sectionTitle}>Bloqueo</Text>
                    {selectedUser.is_blocked ? (
                      <><Text style={s.blockedBanner}>CONDUCTOR BLOQUEADO ({selectedUser.block_type})</Text>
                      <TouchableOpacity style={[s.saveBtn,{backgroundColor:'#10B981'}]} onPress={handleUnblock}>
                        <Text style={s.saveBtnText}>Desbloquear</Text>
                      </TouchableOpacity></>
                    ) : (
                      <><View style={s.radioRow}>
                        {['permanent','hours','days'].map(t => (
                          <TouchableOpacity key={t} style={[s.radioBtn, blockType===t&&s.radioBtnActive]} onPress={() => setBlockType(t)}>
                            <Text style={[s.radioBtnText, blockType===t&&s.radioBtnTextActive]}>{t==='permanent'?'Permanente':t==='hours'?'Horas':'Días'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {blockType !== 'permanent' && <TextInput style={s.input} value={blockDuration} onChangeText={setBlockDuration} keyboardType="numeric" placeholder="Duración" />}
                      <TouchableOpacity style={[s.saveBtn,{backgroundColor:'#EF4444'}]} onPress={handleBlock}>
                        <Text style={s.saveBtnText}>Bloquear conductor</Text>
                      </TouchableOpacity></>
                    )}
                  </View>

                  <View style={s.section}>
                    <Text style={s.sectionTitle}>Prioridad (0=normal, 10=máxima)</Text>
                    <TextInput style={s.input} value={priority} onChangeText={setPriority} keyboardType="numeric" />
                    <TouchableOpacity style={s.saveBtn} onPress={handlePriority}>
                      <Text style={s.saveBtnText}>Guardar prioridad</Text>
                    </TouchableOpacity>
                  </View>
                </>}

                <TouchableOpacity style={s.auditBtn} onPress={() => fetchAuditLogs(selectedUser.user_id)}>
                  <Ionicons name="time" size={18} color="#E85E1A" />
                  <Text style={s.auditBtnText}>Ver historial de cambios</Text>
                </TouchableOpacity>

                {showAudit && auditLogs.length > 0 && (
                  <View style={s.section}>
                    <Text style={s.sectionTitle}>Historial</Text>
                    {auditLogs.map((log, i) => (
                      <View key={i} style={s.auditItem}>
                        <Text style={s.auditAction}>{log.action}</Text>
                        <Text style={s.auditBy}>por {log.admin_name} - {log.source}</Text>
                        <Text style={s.auditChanges}>{JSON.stringify(log.changes||{}).substring(0,100)}</Text>
                        <Text style={s.auditDate}>{log.created_at?.substring(0,16)}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>}
              <View style={{height:40}} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Balance Modal */}
      <Modal visible={showBalanceModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, {maxHeight:300}]}>
            <Text style={s.modalTitle}>Modificar {balanceField==='debt'?'Deuda':'Saldo'}</Text>
            <View style={s.radioRow}>
              {['set','add','subtract'].map(op => (
                <TouchableOpacity key={op} style={[s.radioBtn, balanceOp===op&&s.radioBtnActive]} onPress={() => setBalanceOp(op)}>
                  <Text style={[s.radioBtnText, balanceOp===op&&s.radioBtnTextActive]}>{op==='set'?'Fijar':op==='add'?'Sumar':'Restar'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={s.input} value={balanceAmount} onChangeText={setBalanceAmount} keyboardType="numeric" placeholder="Monto" />
            <View style={{flexDirection:'row',gap:10,marginTop:12}}>
              <TouchableOpacity style={[s.saveBtn,{flex:1,backgroundColor:'#8E8E93'}]} onPress={() => setShowBalanceModal(false)}>
                <Text style={s.saveBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn,{flex:1}]} onPress={handleBalance} disabled={saving}>
                <Text style={s.saveBtnText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create User Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Crear Usuario</Text>
            <View style={s.radioRow}>
              {['rider','driver'].map(t => (
                <TouchableOpacity key={t} style={[s.radioBtn, newUser.user_type===t&&s.radioBtnActive]} onPress={() => setNewUser({...newUser,user_type:t})}>
                  <Text style={[s.radioBtnText, newUser.user_type===t&&s.radioBtnTextActive]}>{t==='rider'?'Pasajero':'Conductor'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={s.input} value={newUser.name} onChangeText={v => setNewUser({...newUser,name:v})} placeholder="Nombre completo" />
            <TextInput style={s.input} value={newUser.email} onChangeText={v => setNewUser({...newUser,email:v})} placeholder="Email" keyboardType="email-address" />
            <TextInput style={s.input} value={newUser.phone} onChangeText={v => setNewUser({...newUser,phone:v})} placeholder="Teléfono" keyboardType="phone-pad" />
            <TextInput style={s.input} value={newUser.password} onChangeText={v => setNewUser({...newUser,password:v})} placeholder="Contraseña" secureTextEntry />
            <View style={{flexDirection:'row',gap:10,marginTop:16}}>
              <TouchableOpacity style={[s.saveBtn,{flex:1,backgroundColor:'#8E8E93'}]} onPress={() => setShowCreateModal(false)}>
                <Text style={s.saveBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.saveBtn,{flex:1}]} onPress={handleCreateUser} disabled={saving}>
                <Text style={s.saveBtnText}>{saving?'Creando...':'Crear'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:'#F2F2F7'},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:16,backgroundColor:'#fff',borderBottomWidth:1,borderBottomColor:'#E5E5EA'},
  title:{fontSize:24,fontWeight:'bold',color:'#1C1C1E'},
  addBtn:{flexDirection:'row',alignItems:'center',backgroundColor:'#E85E1A',paddingHorizontal:14,paddingVertical:8,borderRadius:8,gap:4},
  addBtnText:{color:'#fff',fontWeight:'600',fontSize:14},
  searchRow:{padding:12,backgroundColor:'#fff'},
  searchBox:{flexDirection:'row',alignItems:'center',backgroundColor:'#F2F2F7',borderRadius:10,paddingHorizontal:12,gap:8},
  searchInput:{flex:1,paddingVertical:10,fontSize:15},
  filterRow:{flexDirection:'row',paddingHorizontal:12,paddingVertical:8,gap:8},
  filterBtn:{paddingHorizontal:14,paddingVertical:6,borderRadius:20,backgroundColor:'#E5E5EA'},
  filterBtnActive:{backgroundColor:'#E85E1A'},
  filterBtnText:{fontSize:13,fontWeight:'600',color:'#666'},
  filterBtnTextActive:{color:'#fff'},
  list:{padding:12,gap:10},
  userCard:{backgroundColor:'#fff',borderRadius:12,padding:14},
  userCardHeader:{flexDirection:'row',alignItems:'center',gap:10},
  avatar:{width:40,height:40,borderRadius:20,justifyContent:'center',alignItems:'center'},
  avatarRider:{backgroundColor:'#FF7733'},avatarDriver:{backgroundColor:'#3B82F6'},avatarAdmin:{backgroundColor:'#E85E1A'},
  userName:{fontSize:16,fontWeight:'600',color:'#1C1C1E'},
  userEmail:{fontSize:13,color:'#8E8E93'},
  badge:{paddingHorizontal:8,paddingVertical:2,borderRadius:10},
  badgeRider:{backgroundColor:'#FFF0EC'},badgeDriver:{backgroundColor:'#E3F2FD'},badgeAdmin:{backgroundColor:'#FFF0EC'},
  badgeText:{fontSize:11,fontWeight:'700'},
  blockedText:{fontSize:10,fontWeight:'700',color:'#EF4444',marginTop:2},
  onlineDot:{width:8,height:8,borderRadius:4,backgroundColor:'#10B981',marginTop:4},
  userCardFooter:{flexDirection:'row',gap:16,marginTop:8,paddingTop:8,borderTopWidth:1,borderTopColor:'#F2F2F7'},
  balanceText:{fontSize:13,color:'#10B981',fontWeight:'600'},
  debtText:{fontSize:13,color:'#EF4444',fontWeight:'600'},
  priorityText:{fontSize:13,color:'#F59E0B',fontWeight:'600'},
  emptyText:{textAlign:'center',color:'#8E8E93',marginTop:40,fontSize:16},
  modalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',justifyContent:'center',alignItems:'center',padding:16},
  modalContent:{backgroundColor:'#fff',borderRadius:16,padding:20,width:'100%',maxWidth:500,maxHeight:'85%'},
  modalHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:16},
  modalTitle:{fontSize:20,fontWeight:'bold',color:'#1C1C1E'},
  section:{marginBottom:20,padding:14,backgroundColor:'#F9FAFB',borderRadius:12},
  sectionTitle:{fontSize:14,fontWeight:'700',color:'#E85E1A',marginBottom:10,textTransform:'uppercase'},
  input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#E5E5EA',borderRadius:8,paddingHorizontal:12,paddingVertical:10,fontSize:15,marginBottom:8},
  infoRow:{fontSize:14,color:'#666',marginBottom:4},
  saveBtn:{backgroundColor:'#E85E1A',borderRadius:8,paddingVertical:12,alignItems:'center',marginTop:6},
  saveBtnText:{color:'#fff',fontWeight:'700',fontSize:14},
  balanceRow:{flexDirection:'row',gap:12},
  balanceCard:{flex:1,backgroundColor:'#fff',borderRadius:10,padding:12,alignItems:'center'},
  balanceLabel:{fontSize:12,color:'#8E8E93',fontWeight:'600'},
  balanceValue:{fontSize:20,fontWeight:'bold',color:'#10B981',marginVertical:4},
  smallBtn:{backgroundColor:'#E85E1A',paddingHorizontal:14,paddingVertical:6,borderRadius:6},
  smallBtnText:{color:'#fff',fontSize:12,fontWeight:'600'},
  radioRow:{flexDirection:'row',gap:8,marginBottom:10,flexWrap:'wrap'},
  radioBtn:{paddingHorizontal:14,paddingVertical:8,borderRadius:8,backgroundColor:'#E5E5EA'},
  radioBtnActive:{backgroundColor:'#E85E1A'},
  radioBtnText:{fontSize:13,fontWeight:'600',color:'#666'},
  radioBtnTextActive:{color:'#fff'},
  blockedBanner:{backgroundColor:'#FEE2E2',color:'#EF4444',fontWeight:'700',textAlign:'center',padding:10,borderRadius:8,marginBottom:8},
  auditBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:12,marginBottom:16},
  auditBtnText:{color:'#E85E1A',fontWeight:'600',fontSize:14},
  auditItem:{backgroundColor:'#fff',borderRadius:8,padding:10,marginBottom:6},
  auditAction:{fontSize:13,fontWeight:'700',color:'#1C1C1E'},
  auditBy:{fontSize:11,color:'#8E8E93'},
  auditChanges:{fontSize:11,color:'#666',marginTop:2},
  auditDate:{fontSize:10,color:'#8E8E93',marginTop:2},
  serviceChip:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:14,paddingVertical:10,borderRadius:10,backgroundColor:'#F2F2F7',borderWidth:1.5,borderColor:'#E5E5EA'},
  serviceChipActive:{backgroundColor:'#E85E1A',borderColor:'#E85E1A'},
  serviceChipText:{fontSize:13,fontWeight:'600',color:'#666'},
});
