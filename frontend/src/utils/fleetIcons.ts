// The same artwork used by the client landing and provider hub.
export const FLEET_ICONS={
 car:require('../../assets/vehicles/map-car-moli.png'),
 moto:require('../../assets/vehicles/map-moto-moli.png'),
 professional:require('../../assets/professions/verified-tools.png'),
 paperwork:require('../../assets/modules/paperwork.png'),
 delivery:require('../../assets/modules/delivery.png'),
 electrician:require('../../assets/professions/electrician.png'),
 plumber:require('../../assets/professions/plumber.png'),
 cleaner:require('../../assets/professions/cleaner.png'),
 mover:require('../../assets/professions/mover.png'),
 painter:require('../../assets/professions/painter.png'),
 gardener:require('../../assets/professions/gardener.png'),
 carpenter:require('../../assets/professions/carpenter.png'),
 mechanic:require('../../assets/professions/mechanic.png'),
 technician:require('../../assets/professions/technician.png'),
};
type ProviderIcon={activity?:string;vehicle_type?:string;provider_type?:string;category?:string;active_job?:any;active_delivery?:any};
const professions:Record<string,keyof typeof FLEET_ICONS>={electricista:'electrician',plomero:'plumber',plomeria:'plumber',limpieza:'cleaner',mudanza:'mover',mudanzas:'mover',pintura:'painter',pintor:'painter',jardineria:'gardener',jardinero:'gardener',carpinteria:'carpenter',carpintero:'carpenter',mecanica:'mechanic',mecanico:'mechanic',tecnologia:'technician',tecnico:'technician'};
export function fleetIconKey(provider:ProviderIcon):keyof typeof FLEET_ICONS{
 if(['tramites','tramite'].includes(provider.activity||'')||provider.category==='tramites')return'paperwork';
 if(['delivery','delivery_driver','parcel','paqueteria'].includes(provider.activity||'')||provider.active_delivery)return'delivery';
 if(provider.provider_type==='professional'||['job','professional','oficio'].includes(provider.activity||'')||provider.active_job)return professions[provider.category||'']||'professional';
 return ['moto','motorcycle','moto_driver'].includes(provider.vehicle_type||'')?'moto':'car';
}
export function fleetIconUrl(provider:ProviderIcon){return`/fleet-icons/${fleetIconKey(provider)}.png`;}
