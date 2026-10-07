import {database} from '@/lib/metasync/server';
import {brokers, type Broker} from '@/lib/metasync/hosted';
export async function serverCatalog():Promise<Broker[]> {
 const existing=brokers();
 const {data,error}=await database().from('investpro_mt_server_catalog').select('id,label,platform,server');
 if(error)throw Error('Catalogue indisponible');
 // Environment entries remain authoritative for existing templates.
 return [...existing,...(data??[]).filter(b=>!existing.some(e=>e.id===b.id||e.platform===b.platform&&e.server.toLowerCase()===b.server.toLowerCase()))];
}
