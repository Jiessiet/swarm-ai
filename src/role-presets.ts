import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeRoles, type AgentRole } from './roles.js';
export type RolePreset = { id: string; name: string; count: number; roles: AgentRole[]; createdAt: string; updatedAt: string };
export function createRolePresetStore(path = resolve(process.env.ROLE_PRESET_FILE ?? 'data/role-presets.json')) {
  let pending = Promise.resolve();
  async function read(): Promise<RolePreset[]> {
    let text: string;
    try { text = await readFile(path, 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const data = JSON.parse(text);
    if (data.version !== 1 || !Array.isArray(data.presets)) throw new Error('Invalid role preset file; existing data was not changed');
    return data.presets.map((preset:RolePreset) => ({...preset,roles:normalizeRoles(preset.count,preset.roles).assignments}));
  }
  return {
    async list() { return (await read()).map(({roles,...metadata})=>metadata).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)); },
    async get(id: string) { const preset=(await read()).find(p=>p.id===id); if(!preset)throw new Error('Role preset not found');return preset; },
    async save(name: unknown, roles: unknown) {
      if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('Preset name must be 1..80 characters');
      if(!Array.isArray(roles))throw new Error('Provide the team roles to save');
      const assignments=normalizeRoles(roles.length,roles).assignments;
      let result!:RolePreset;
      const operation=pending.then(async()=>{
        const presets=await read(),existing=presets.find(p=>p.name.toLowerCase()===name.trim().toLowerCase()),now=new Date().toISOString();
        if(!existing&&presets.length>=100)throw new Error('Role preset library is full; save over an existing preset name');
        result={id:existing?.id??randomUUID(),name:name.trim(),count:assignments.length,roles:assignments,createdAt:existing?.createdAt??now,updatedAt:now};
        const next=existing?presets.map(p=>p.id===existing.id?result:p):[...presets,result];
        await mkdir(dirname(path),{recursive:true,mode:0o700});
        const temporary=`${path}.${randomUUID()}.tmp`;
        try {await writeFile(temporary,JSON.stringify({version:1,presets:next},null,2),{flag:'wx',mode:0o600});await rename(temporary,path);}
        finally {await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
      });
      pending=operation.catch(()=>{});
      await operation;return result;
    },
  };
}
