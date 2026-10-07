import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'astro/config';

const jsonBody=(chunks)=>JSON.parse(Buffer.concat(chunks).toString('utf8'));
const readJsonFile=(relativePath)=>JSON.parse(fs.readFileSync(path.join(process.cwd(),relativePath),'utf8'));
const normalizeVendorStatus=(service)=>{const status=String(service?.status||'online').toLowerCase();return status==='offline'||status==='busy'?status:'online'};
const writePrivateJson=(relativePath,payload)=>{
  const sourcePath=path.join(process.cwd(),relativePath);
  const output=JSON.stringify(payload,null,2)+'\n';
  fs.mkdirSync(path.dirname(sourcePath),{recursive:true});
  fs.writeFileSync(sourcePath,output,'utf8');
};

const writeJsonCopies=(relativePath,payload)=>{const sourcePath=path.join(process.cwd(),relativePath);const publicPath=path.join(process.cwd(),'public',relativePath);const output=JSON.stringify(payload,null,2)+'\n';fs.mkdirSync(path.dirname(sourcePath),{recursive:true});fs.mkdirSync(path.dirname(publicPath),{recursive:true});fs.writeFileSync(sourcePath,output,'utf8');fs.writeFileSync(publicPath,output,'utf8')};

const pedestrianNetworkSavePlugin = () => ({
  name: 'campusmaas-pedestrian-network-save',
  configureServer(server) {
    server.middlewares.use('/__campusmaas/vendor-data',(req,res,next)=>{
      if(req.method!=='GET'){next();return;}
      try{
        const parsed=new URL(req.url||'', 'http://localhost');
        const vendorId=parsed.searchParams.get('vendor_id');
        const optionId=parsed.searchParams.get('option_id');
        const developerScope=parsed.searchParams.get('developer')==='1';
        const catalogue=readJsonFile('maps/campus_vendors.json');
        const allOrders=readJsonFile('maps/campus_orders.json');
        const activeStatuses=new Set(['placed','accepted','preparing']);

        let scopedOrders=[];
        if(developerScope){
          scopedOrders=allOrders.orders;
        }else if(vendorId){
          scopedOrders=allOrders.orders.filter((order)=>{
            if(String(order.vendor_id)!==String(vendorId)) return false;
            return !optionId || String(order.option_id)===String(optionId);
          });
        }

        const orderSummary=catalogue.vendors.flatMap((vendor)=>{
          const vendorOrders=allOrders.orders.filter((order)=>
            String(order.vendor_id)===String(vendor.id)
          );
          return (vendor.options||[]).map((option)=>({
            vendor_id:vendor.id,
            option_id:option.id,
            active:vendorOrders.filter((order)=>
              String(order.option_id)===String(option.id) &&
              activeStatuses.has(String(order.status||'').toLowerCase())
            ).length
          }));
        });

        res.statusCode=200;
        res.setHeader('Content-Type','application/json');
        res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({
          catalogue,
          orders:{
            version:1,
            orders:scopedOrders
          },
          order_summary:orderSummary
        }));
      }catch(error){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({ok:false,error:error instanceof Error?error.message:'Vendor data unavailable'}));
      }
    });

    server.middlewares.use('/__campusmaas/user-orders',(req,res,next)=>{
      if(req.method!=='GET'){next();return;}
      try{
        const parsed=new URL(req.url||'','http://localhost');
        const userId=String(parsed.searchParams.get('user_id')||'').trim();
        if(!userId || userId.length>80){
          res.statusCode=400;
          res.setHeader('Content-Type','application/json');
          res.end(JSON.stringify({ok:false,error:'Invalid user id.'}));
          return;
        }

        const orders=readJsonFile('maps/campus_orders.json');
        if(orders?.version!==1||!Array.isArray(orders?.orders))throw Error('Invalid order database.');

        const mine=orders.orders.filter((order)=>
          String(order.user_id||'')===userId
        );

        res.statusCode=200;
        res.setHeader('Content-Type','application/json');
        res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({version:1,orders:mine}));
      }catch(error){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({ok:false,error:error instanceof Error?error.message:'Orders unavailable'}));
      }
    });

    server.middlewares.use('/__campusmaas/save-vendors',(req,res,next)=>{if(req.method!=='POST')return next();const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{try{const p=jsonBody(chunks);if(p?.version!==1||!Array.isArray(p.vendors))throw Error('Invalid vendor catalogue.');const vids=new Set(),oids=new Set();for(const v of p.vendors){if(!v?.id||vids.has(String(v.id))||!String(v.name||'').trim())throw Error('Invalid vendor.');vids.add(String(v.id));if(!Array.isArray(v.options))throw Error('Invalid vendor options.');for(const o of v.options){if(!o?.id||oids.has(String(o.id))||!String(o.name||'').trim())throw Error('Invalid vendor option.');oids.add(String(o.id));if(Number(o.order)<1||Number(o.service_minutes)<0||Number(o.price)<0)throw Error('Invalid option values.')}}writeJsonCopies('maps/campus_vendors.json',p);res.statusCode=200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}))}catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,error:e.message||'Vendor save failed'}))}})});
    server.middlewares.use('/__campusmaas/create-order',(req,res,next)=>{
      if(req.method!=='POST')return next();
      const chunks=[];
      req.on('data',c=>chunks.push(c));
      req.on('end',()=>{
        try{
          const p=jsonBody(chunks);
          const cata=readJsonFile('maps/campus_vendors.json');
          const v=cata.vendors.find(x=>x.id===p.vendor_id&&x.enabled!==false);
          const o=v?.options?.find(x=>x.id===p.option_id&&x.enabled!==false);
          if(!v||!o)throw Error('Selected service is unavailable.');
          if(normalizeVendorStatus(o)==='offline')throw Error(o.status_message||'Selected service is currently unavailable.');

          const orders=readJsonFile('maps/campus_orders.json');
          const n=orders.orders.reduce((m,x)=>Math.max(m,Number(String(x.id||'').replace(/\D/g,''))||0),0)+1;
          const orderId='CM-'+String(n).padStart(4,'0');
          let order;

          if(v.id==='food'){
            if(!Array.isArray(p.items)||!p.items.length)throw Error('Select at least one food item.');
            if(!/^[a-z0-9-]+$/i.test(String(o.id)))throw Error('Invalid food service id.');
            const menu=readJsonFile(path.join('maps','food_menus',String(o.id)+'.json'));
            if(menu?.version!==1||menu.vendor_id!==v.id||menu.service_id!==o.id||!Array.isArray(menu.menu))throw Error('Invalid food menu.');
            const validItems=[];let quantity=0,total=0;
            for(const entry of p.items){
              const item=menu.menu.find(x=>x.id===entry.menu_item_id&&x.available!==false);
              const q=Math.max(1,Math.min(99,Math.floor(Number(entry.quantity)||0)));
              if(!item||q<1)throw Error('Selected food item is unavailable.');
              quantity+=q;
              total+=(Number(item.price)||0)*q;
              validItems.push({menu_item_id:item.id,menu_item_name:item.name,quantity:q,unit_price:Number(item.price)||0});
            }
            order={id:orderId,user_id:String(p.user_id||'anonymous').slice(0,80),vendor_id:v.id,vendor_name:v.name,option_id:o.id,option_name:o.name,items:validItems,item_count:validItems.length,quantity,total_price:total,service_minutes:Number(o.service_minutes)||0,status:'placed',created_at:new Date().toISOString()};
          }else if(v.id==='printer'){
            if(!Array.isArray(p.files)||!p.files.length)throw Error('Select at least one file to print.');
            if(p.files.length>100)throw Error('Too many files in one print order.');
            const orderDir=path.join(process.cwd(),'maps','print_orders',orderId);
            fs.mkdirSync(orderDir,{recursive:true});
            const storedFiles=[];
            let totalCopies=0;
            let totalBytes=0;
            p.files.forEach((file,index)=>{
              const name=String(file?.name||'file-'+(index+1)).trim();
              const copies=Math.max(1,Math.min(99,Math.floor(Number(file?.copies)||0)));
              const sides=String(file?.sides||'single').toLowerCase();
              const color=String(file?.color||'bw').toLowerCase();
              const size=Math.max(0,Number(file?.size)||0);
              const data=String(file?.data_base64||'');
              if(!name)throw Error('Invalid print file name.');
              if(!['single','double'].includes(sides))throw Error('Invalid print sides.');
              if(!['bw','color'].includes(color))throw Error('Invalid print colour.');
              if(!data)throw Error('Print file data is missing.');
              if(size!==0&&size>50*1024*1024)throw Error('Print files must be 50 MB or smaller each.');
              if(!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('Invalid print file data.');
              const buffer=Buffer.from(data,'base64');
              if(size>0&&buffer.length!==size)throw Error('Print file size validation failed.');
              totalBytes+=buffer.length;
              if(totalBytes>250*1024*1024)throw Error('Total print upload is too large.');
              totalCopies+=copies;
              const safeName=name.replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,180)||('file-'+(index+1));
              const storedName=String(index+1).padStart(3,'0')+'-'+safeName;
              fs.writeFileSync(path.join(orderDir,storedName),buffer);
              storedFiles.push({name,type:String(file?.type||'application/octet-stream').slice(0,200),size:buffer.length,copies,sides,color,stored_path:path.posix.join('maps','print_orders',orderId,storedName)});
            });
            const total=(Number(o.price)||0)*totalCopies;
            order={id:orderId,user_id:String(p.user_id||'anonymous').slice(0,80),vendor_id:v.id,vendor_name:v.name,option_id:o.id,option_name:o.name,files:storedFiles,quantity:totalCopies,total_price:total,service_minutes:Number(o.service_minutes)||0,status:'placed',created_at:new Date().toISOString()};
          }else{
            const q=Math.max(1,Math.min(99,Math.floor(Number(p.quantity)||1)));
            order={id:orderId,user_id:String(p.user_id||'anonymous').slice(0,80),vendor_id:v.id,vendor_name:v.name,option_id:o.id,option_name:o.name,quantity:q,unit_price:Number(o.price)||0,total_price:(Number(o.price)||0)*q,service_minutes:Number(o.service_minutes)||0,status:'placed',created_at:new Date().toISOString()};
          }

          orders.orders.push(order);
          writePrivateJson('maps/campus_orders.json',orders);
          res.statusCode=200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,order_id:order.id}));
        }catch(e){
          res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,error:e.message||'Order creation failed'}));
        }
      });
    });
    server.middlewares.use('/__campusmaas/print-file', (req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }

      try {
        const parsed = new URL(req.url || '', 'http://localhost');
        const orderId = parsed.searchParams.get('order_id');
        const fileIndex = Number(parsed.searchParams.get('file_index'));
        if (!orderId || !Number.isInteger(fileIndex) || fileIndex < 0) {
          throw new Error('Invalid print file request.');
        }

        const orders = readJsonFile('maps/campus_orders.json');
        const order = orders.orders.find(
          (item) =>
            item.id === orderId &&
            item.vendor_id === 'printer' &&
            Array.isArray(item.files)
        );
        const file = order?.files?.[fileIndex];
        if (!order || !file?.stored_path) {
          res.statusCode = 404;
          res.end('Print file not found.');
          return;
        }

        const absolutePath = path.resolve(process.cwd(), file.stored_path);
        const printRoot = path.resolve(process.cwd(), 'maps', 'print_orders');
        if (!(absolutePath === printRoot || absolutePath.startsWith(printRoot + path.sep)) ||
            !fs.existsSync(absolutePath)) {
          res.statusCode = 404;
          res.end('Print file not found.');
          return;
        }

        const mimeByExtension = {
          '.pdf': 'application/pdf',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.txt': 'text/plain; charset=utf-8',
          '.csv': 'text/csv; charset=utf-8',
          '.html': 'text/html; charset=utf-8'
        };
        const ext = path.extname(absolutePath).toLowerCase();
        const mime = mimeByExtension[ext] || file.type || 'application/octet-stream';

        res.statusCode = 200;
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Disposition', 'inline; filename="' + String(file.name || path.basename(absolutePath)).replace(/["\\]/g, '_') + '"');
        res.end(fs.readFileSync(absolutePath));
      } catch (error) {
        res.statusCode = 400;
        res.end(error instanceof Error ? error.message : 'Print file request failed.');
      }
    });

    server.middlewares.use('/__campusmaas/print-batch', (req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }

      try {
        const parsed = new URL(req.url || '', 'http://localhost');
        const orderId = parsed.searchParams.get('order_id');
        const indexes = String(parsed.searchParams.get('indexes') || '')
          .split(',')
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0);

        if (!orderId || !indexes.length) {
          throw new Error('Invalid print batch request.');
        }

        const orders = readJsonFile('maps/campus_orders.json');
        const order = orders.orders.find(
          (item) =>
            item.id === orderId &&
            item.vendor_id === 'printer' &&
            Array.isArray(item.files)
        );

        if (!order) {
          res.statusCode = 404;
          res.end('Print order not found.');
          return;
        }

        const uniqueIndexes = [...new Set(indexes)].filter((index) => order.files[index]);
        const escapeHtml = (value) =>
          String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        const items = uniqueIndexes.map((index) => {
          const file = order.files[index];
          const url =
            '/__campusmaas/print-file?order_id=' +
            encodeURIComponent(order.id) +
            '&file_index=' +
            encodeURIComponent(String(index));
          const name = escapeHtml(file.name || ('File ' + (index + 1)));
          const copies = Number(file.copies) || 1;
          const settings =
            (file.color === 'color' ? 'Colour' : 'Black & White') +
            ' · ' +
            (file.sides === 'double' ? 'Both sides' : 'One side') +
            ' · ' +
            copies +
            (copies === 1 ? ' copy' : ' copies');

          const ext = path.extname(String(file.name || '')).toLowerCase();
          const supportedImage = ['.png','.jpg','.jpeg','.gif','.webp','.svg'].includes(ext);
          const supportedText = ['.txt','.csv'].includes(ext);
          const body = supportedImage
            ? '<img src="' + url + '" alt="' + name + '">'
            : supportedText
              ? '<iframe src="' + url + '" title="' + name + '"></iframe>'
              : '<div class="unsupported"><strong>' + name + '</strong><span>This file type must be opened in its own application.</span><a href="' + url + '" target="_blank" rel="noreferrer">OPEN FILE</a></div>';

          return '<section class="sheet"><header><strong>' + name + '</strong><small>' + escapeHtml(settings) + '</small></header>' + body + '</section>';
        }).join('');

        const label = escapeHtml(parsed.searchParams.get('label') || ('Order #' + order.id));

        const html='<!doctype html><html><head><meta charset="utf-8"><title>' + label + '</title><style>' +
          'body{margin:0;background:#e9eef3;color:#102132;font-family:Arial,sans-serif;padding:24px}' +
          '.toolbar{position:sticky;top:0;display:flex;justify-content:space-between;gap:12px;padding:10px 0 16px;background:#e9eef3;z-index:2}' +
          '.toolbar strong{font-size:14px}.toolbar button{border:0;border-radius:8px;background:#1687ff;color:#fff;padding:9px 14px;font-weight:700;cursor:pointer}' +
          '.sheet{background:#fff;margin:0 auto 18px;max-width:760px;min-height:420px;padding:18px;box-sizing:border-box;box-shadow:0 10px 30px rgba(15,35,53,.12);break-after:page}' +
          '.sheet header{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.sheet header strong{font-size:12px}.sheet header small{font-size:9px;color:#6f8395}' +
          '.sheet img{display:block;max-width:100%;max-height:650px;margin:0 auto}.sheet iframe{width:100%;height:680px;border:0}.unsupported{display:grid;place-items:center;min-height:360px;text-align:center;gap:8px;color:#60778b}.unsupported strong{color:#18344d}.unsupported a{color:#1687ff}' +
          '@media print{body{padding:0;background:#fff}.toolbar{display:none}.sheet{max-width:none;margin:0;box-shadow:none;min-height:100vh;padding:12mm}.sheet:last-child{break-after:auto}}' +
          '</style></head><body><div class="toolbar"><strong>' + label + '</strong><button onclick="window.print()">PRINT</button></div>' +
          items + '<script>setTimeout(function(){try{window.print()}catch(e){}},700)<\/script></body></html>';

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      } catch (error) {
        res.statusCode = 400;
        res.end(error instanceof Error ? error.message : 'Print batch request failed.');
      }
    });

    server.middlewares.use('/__campusmaas/update-order',(req,res,next)=>{
      if(req.method!=='POST')return next();
      const chunks=[];
      req.on('data',c=>chunks.push(c));
      req.on('end',()=>{
        try{
          const p=jsonBody(chunks);
          const allowed=new Set(['preparing','ready','completed','cancelled']);
          if(!p?.id||!allowed.has(p.status))throw Error('Invalid order update.');

          const orders=readJsonFile('maps/campus_orders.json');
          if(orders?.version!==1||!Array.isArray(orders?.orders))throw Error('Invalid order database.');

          const o=orders.orders.find(x=>x.id===p.id);
          if(!o)throw Error('Order not found.');

          const current=String(o.status||'').toLowerCase();

          if(p.status==='preparing'&&!['placed','accepted'].includes(current)){
            throw Error('Order must be placed before preparation starts.');
          }

          if(p.status==='ready'&&!['preparing','accepted'].includes(current)){
            throw Error('Order must be preparing before it can be marked ready.');
          }

          if(p.status==='completed'){
            if(current!=='ready')throw Error('Order must be ready before collection is confirmed.');
            if(!p.user_id||String(o.user_id||'')!==String(p.user_id)){
              throw Error('Only the order owner can confirm collection.');
            }
          }

          if(p.status==='cancelled'&&!['placed','preparing','ready'].includes(current)){
            throw Error('This order cannot be cancelled from its current state.');
          }

          o.status=p.status;
          o.updated_at=new Date().toISOString();
          writePrivateJson('maps/campus_orders.json',orders);

          res.statusCode=200;
          res.setHeader('Content-Type','application/json');
          res.setHeader('Cache-Control','no-store');
          res.end(JSON.stringify({ok:true}));
        }catch(e){
          res.statusCode=400;
          res.setHeader('Content-Type','application/json');
          res.end(JSON.stringify({ok:false,error:e.message||'Order update failed'}));
        }
      });
    });

    server.middlewares.use('/__campusmaas/save-gates', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      const chunks = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(raw);

          if (
            payload?.type !== 'FeatureCollection' ||
            payload?.properties?.format !== 'campusmaas-gates' ||
            Number(payload?.properties?.version) < 1 ||
            !Array.isArray(payload?.features)
          ) {
            throw new Error('Invalid gates payload.');
          }

          const root = process.cwd();
          const sourcePath = path.join(root, 'maps', 'gates.geojson');
          const publicPath = path.join(root, 'public', 'maps', 'gates.geojson');
          const output = JSON.stringify(payload, null, 2) + '\n';

          fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
          fs.mkdirSync(path.dirname(publicPath), { recursive: true });
          fs.writeFileSync(sourcePath, output, 'utf8');
          fs.writeFileSync(publicPath, output, 'utf8');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, features: payload.features.length }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Gate save failed'
          }));
        }
      });
    });

    server.middlewares.use('/__campusmaas/save-access-rules', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      const chunks = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(raw);

          const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
          const validModes = new Set([
            'preferred',
            'allow',
            'deny',
            'allow_only_during',
            'deny_during'
          ]);
          const validDirections = new Set(['in_out', 'in', 'out']);
          const validTargetTypes = new Set(['gate', 'path']);
          const validGroups = new Set([
            'all',
            'students',
            'boys',
            'girls',
            'hostellers',
            'day_scholars',
            'staff',
            'faculty',
            'visitors'
          ]);
          const validDays = new Set([
            'mon',
            'tue',
            'wed',
            'thu',
            'fri',
            'sat',
            'sun'
          ]);

          if (
            payload?.version !== 1 ||
            payload?.timezone !== 'Asia/Kolkata' ||
            !Array.isArray(payload?.policies)
          ) {
            throw new Error('Invalid access rules root.');
          }

          const gatesData = readJsonFile('maps/gates.geojson');
          const pathsData = readJsonFile('maps/pedestrian_paths_edits.geojson');

          const gateIds = new Set(
            (gatesData?.features || []).map((feature) => String(feature?.id || '')).filter(Boolean)
          );

          const pathIds = new Set(
            (pathsData?.features || []).map((feature, index) =>
              String(
                feature?.id ||
                feature?.properties?.['@id'] ||
                'path-' + (index + 1)
              )
            )
          );

          const policyIds = new Set();

          const validPolicies = payload.policies.every((policy) => {
            const target = policy?.target;
            const windows = Array.isArray(policy?.windows) ? policy.windows : [];

            if (
              !policy?.id ||
              policyIds.has(String(policy.id)) ||
              !target?.id ||
              !validTargetTypes.has(target?.type) ||
              (
                target.type === 'gate'
                  ? !gateIds.has(String(target.id))
                  : !pathIds.has(String(target.id))
              ) ||
              !validGroups.has(policy.group) ||
              !validModes.has(policy.mode) ||
              !validDirections.has(policy.direction) ||
              typeof policy.enabled !== 'boolean' ||
              !Number.isInteger(Number(policy.priority)) ||
              Number(policy.priority) < 0 ||
              Number(policy.priority) > 100 ||
              !Array.isArray(policy.days) ||
              policy.days.length < 1 ||
              !policy.days.every((day) => validDays.has(day))
            ) {
              return false;
            }

            policyIds.add(String(policy.id));

            if (
              typeof policy.name !== 'string' ||
              policy.name.trim().length < 1 ||
              policy.name.length > 80
            ) {
              return false;
            }

            if (
              typeof policy.description !== 'string' ||
              policy.description.length > 240
            ) {
              return false;
            }

            if (!Array.isArray(windows)) {
              return false;
            }

            return windows.every((window) => {
              if (
                !timePattern.test(String(window?.start || '')) ||
                !timePattern.test(String(window?.end || ''))
              ) {
                return false;
              }

              const [startHour, startMinute] = window.start.split(':').map(Number);
              const [endHour, endMinute] = window.end.split(':').map(Number);
              const startMinutes = startHour * 60 + startMinute;
              const endMinutes = endHour * 60 + endMinute;

              return startMinutes < endMinutes;
            }) &&
            (
              policy.mode !== 'allow_only_during' &&
              policy.mode !== 'deny_during'
              || windows.length > 0
            );
          });

          if (!validPolicies) {
            throw new Error('Invalid campus access rule.');
          }

          const root = process.cwd();
          const sourcePath = path.join(root, 'maps', 'campus_access_rules.json');
          const publicPath = path.join(root, 'public', 'maps', 'campus_access_rules.json');
          const output = JSON.stringify(payload, null, 2) + '\n';

          fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
          fs.mkdirSync(path.dirname(publicPath), { recursive: true });
          fs.writeFileSync(sourcePath, output, 'utf8');
          fs.writeFileSync(publicPath, output, 'utf8');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, policies: payload.policies.length }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Access rules save failed'
          }));
        }
      });
    });

    server.middlewares.use('/__campusmaas/save-pedestrian-network', (req, res, next) => {
      if (req.method !== 'POST') {
        next();
        return;
      }

      const chunks = [];

      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const payload = JSON.parse(raw);

          const validPathCategories = new Set([
            'Main Road',
            'Road',
            'Ground',
            'Pedestrian Path'
          ]);

          const validRoot =
            payload?.type === 'FeatureCollection' &&
            Array.isArray(payload?.features) &&
            Object.keys(payload).every((key) =>
              key === 'type' || key === 'features'
            );

          const validFeatures = payload.features.every((feature) => {
            const featureKeys = Object.keys(feature || {});
            const propertyKeys = Object.keys(feature?.properties || {});
            const hasGroundShape = Object.prototype.hasOwnProperty.call(
              feature?.properties || {},
              'ground_shape'
            );

            return (
              feature?.type === 'Feature' &&
              featureKeys.every((key) =>
                key === 'type' || key === 'id' || key === 'properties' || key === 'geometry'
              ) &&
              featureKeys.includes('type') &&
              featureKeys.includes('properties') &&
              featureKeys.includes('geometry') &&
              (!Object.prototype.hasOwnProperty.call(feature, 'id') ||
                typeof feature.id === 'string' ||
                typeof feature.id === 'number') &&
              propertyKeys.every((key) => key === 'category' || key === 'ground_shape') &&
              propertyKeys.includes('category') &&
              (!hasGroundShape ||
                (
                  typeof feature.properties.ground_shape === 'string' &&
                  ['square', 'circle', 'free', 'polygon'].includes(
                    feature.properties.ground_shape
                  )
                )) &&
              validPathCategories.has(feature.properties.category) &&
              feature?.geometry?.type === 'LineString' &&
              Array.isArray(feature.geometry.coordinates) &&
              feature.geometry.coordinates.length >= 2 &&
              feature.geometry.coordinates.every((coordinate) =>
                Array.isArray(coordinate) &&
                coordinate.length >= 2 &&
                Number.isFinite(Number(coordinate[0])) &&
                Number.isFinite(Number(coordinate[1]))
              )
            );
          });

          if (!validRoot || !validFeatures) {
            throw new Error('Invalid pedestrian network payload.');
          }

          const root = process.cwd();
          const sourcePath = path.join(root, 'maps', 'pedestrian_paths_edits.geojson');
          const publicPath = path.join(root, 'public', 'maps', 'pedestrian_paths_edits.geojson');
          const output = JSON.stringify(payload, null, 2) + '\n';

          fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
          fs.mkdirSync(path.dirname(publicPath), { recursive: true });
          fs.writeFileSync(sourcePath, output, 'utf8');
          fs.writeFileSync(publicPath, output, 'utf8');

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, features: payload.features.length }));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : 'Save failed'
          }));
        }
      });
    });
  }
});

export default defineConfig({
  output: 'static',
  vite: {
    plugins: [pedestrianNetworkSavePlugin()]
  }
});
