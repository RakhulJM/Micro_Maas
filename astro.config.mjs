import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
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

const decodeBase64=(value)=>{
  const data=String(value||'');
  if(!data||!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw Error('Invalid file data.');
  return Buffer.from(data,'base64');
};

const safeFileStem=(value,fallback='file')=>String(value||fallback)
  .replace(/[\\/:*?"<>|]+/g,'_')
  .replace(/\\s+/g,' ')
  .trim()
  .slice(0,180)||fallback;

const convertUploadedFileToPdf=(name,data)=>{
  const inputBuffer=Buffer.isBuffer(data)?data:decodeBase64(data);
  if(inputBuffer.length>50*1024*1024) throw Error('Print files must be 50 MB or smaller each.');
  if(inputBuffer.subarray(0,5).toString('ascii')==='%%PDF') return inputBuffer;

  const workDir=fs.mkdtempSync(path.join(os.tmpdir(),'campusmaas-print-'));
  const inputName=safeFileStem(name,'file') || 'file';
  const inputPath=path.join(workDir,inputName);
  const outputDir=path.join(workDir,'out');
  const profileDir=path.join(workDir,'profile');
  fs.mkdirSync(outputDir,{recursive:true});
  fs.mkdirSync(profileDir,{recursive:true});
  fs.writeFileSync(inputPath,inputBuffer);

  try{
    execFileSync('soffice',[
      '--headless',
      '--convert-to','pdf',
      '--outdir',outputDir,
      '-env:UserInstallation=file://'+profileDir,
      inputPath
    ],{stdio:'pipe',timeout:120000});

    const outputPath=path.join(outputDir,path.basename(inputName,path.extname(inputName))+'.pdf');
    if(!fs.existsSync(outputPath)) throw Error('LibreOffice did not produce a PDF.');
    return fs.readFileSync(outputPath);
  }catch(error){
    const detail=Buffer.isBuffer(error?.stderr)?error.stderr.toString('utf8').trim():'';
    throw Error(detail||('Unsupported file type or PDF conversion failed for '+name+'.'));
  }finally{
    fs.rmSync(workDir,{recursive:true,force:true});
  }
};

const mergePdfFiles=(files)=>{
  if(!files.length) throw Error('No PDF files selected.');
  if(files.length===1) return fs.readFileSync(files[0]);
  const workDir=fs.mkdtempSync(path.join(os.tmpdir(),'campusmaas-print-merge-'));
  const outputPath=path.join(workDir,'print-job.pdf');
  try{
    execFileSync('pdfunite',[...files,outputPath],{stdio:'pipe',timeout:120000});
    if(!fs.existsSync(outputPath)) throw Error('PDF merge did not produce an output file.');
    return fs.readFileSync(outputPath);
  }catch(error){
    const detail=Buffer.isBuffer(error?.stderr)?error.stderr.toString('utf8').trim():'';
    throw Error(detail||'PDF print job could not be prepared.');
  }finally{
    fs.rmSync(workDir,{recursive:true,force:true});
  }
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
              const originalSize=Math.max(0,Number(file?.original_size||file?.size)||0);
              const data=String(file?.data_base64||'');
              if(!name)throw Error('Invalid print file name.');
              if(!['single','double'].includes(sides))throw Error('Invalid print sides.');
              if(!['bw','color'].includes(color))throw Error('Invalid print colour.');
              if(!data)throw Error('Print file data is missing.');
              const pdfBuffer=decodeBase64(data);
              if(pdfBuffer.subarray(0,5).toString('ascii')!=='%PDF-')throw Error('Print order files must be generated PDF documents.');
              if(pdfBuffer.length>50*1024*1024)throw Error('Generated PDF files must be 50 MB or smaller each.');
              totalBytes+=pdfBuffer.length;
              if(totalBytes>250*1024*1024)throw Error('Total print upload is too large.');
              totalCopies+=copies;
              const safeName=safeFileStem(name,'file-'+(index+1));
              const storedName=String(index+1).padStart(3,'0')+'-'+safeName+'.pdf';
              fs.writeFileSync(path.join(orderDir,storedName),pdfBuffer);
              storedFiles.push({
                name,
                type:'application/pdf',
                original_type:String(file?.original_type||'application/octet-stream').slice(0,200),
                original_size:originalSize,
                size:pdfBuffer.length,
                copies,
                sides,
                color,
                stored_path:path.posix.join('maps','print_orders',orderId,storedName)
              });
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
    server.middlewares.use('/__campusmaas/convert-print-file',(req,res,next)=>{
      if(req.method!=='POST')return next();
      const chunks=[];
      req.on('data',c=>chunks.push(c));
      req.on('end',()=>{
        try{
          const p=jsonBody(chunks);
          const name=String(p?.name||'file').trim();
          const data=decodeBase64(p?.data_base64);
          if(!name)throw Error('Invalid file name.');
          if(data.length>50*1024*1024)throw Error('Print files must be 50 MB or smaller each.');
          const pdf=convertUploadedFileToPdf(name,data);
          res.statusCode=200;
          res.setHeader('Content-Type','application/json');
          res.setHeader('Cache-Control','no-store');
          res.end(JSON.stringify({ok:true,name,type:'application/pdf',size:pdf.length,pdf_base64:pdf.toString('base64')}));
        }catch(error){
          res.statusCode=400;
          res.setHeader('Content-Type','application/json');
          res.end(JSON.stringify({ok:false,error:error.message||'PDF conversion failed.'}));
        }
      });
    });

    server.middlewares.use('/__campusmaas/print-file',(req,res,next)=>{
      if(req.method!=='GET')return next();
      try{
        const parsed=new URL(req.url||'', 'http://localhost');
        const orderId=parsed.searchParams.get('order_id');
        const fileIndex=Number(parsed.searchParams.get('file_index'));
        if(!orderId||!Number.isInteger(fileIndex)||fileIndex<0)throw Error('Invalid print file request.');
        const orders=readJsonFile('maps/campus_orders.json');
        const order=orders.orders.find((item)=>item.id===orderId&&item.vendor_id==='printer'&&Array.isArray(item.files));
        const file=order?.files?.[fileIndex];
        if(!order||!file?.stored_path){res.statusCode=404;res.end('Print file not found.');return;}
        const absolutePath=path.resolve(process.cwd(),file.stored_path);
        const printRoot=path.resolve(process.cwd(),'maps','print_orders');
        if(!(absolutePath.startsWith(printRoot+path.sep))||!fs.existsSync(absolutePath)){res.statusCode=404;res.end('Print file not found.');return;}
        const copies=Math.max(1,Math.min(99,Number(file.copies)||1));
        const inputs=Array.from({length:copies},()=>absolutePath);
        const pdf=mergePdfFiles(inputs);
        res.statusCode=200;
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition','inline; filename="'+safeFileStem(file.name,'print')+'.pdf"');
        res.setHeader('Cache-Control','no-store');
        res.end(pdf);
      }catch(error){res.statusCode=400;res.end(error.message||'Print file request failed.');}
    });

    server.middlewares.use('/__campusmaas/print-batch',(req,res,next)=>{
      if(req.method!=='GET')return next();
      try{
        const parsed=new URL(req.url||'', 'http://localhost');
        const orderId=parsed.searchParams.get('order_id');
        const indexes=String(parsed.searchParams.get('indexes')||'').split(',').map(Number).filter((value)=>Number.isInteger(value)&&value>=0);
        if(!orderId||!indexes.length)throw Error('Invalid print batch request.');
        const orders=readJsonFile('maps/campus_orders.json');
        const order=orders.orders.find((item)=>item.id===orderId&&item.vendor_id==='printer'&&Array.isArray(item.files));
        if(!order){res.statusCode=404;res.end('Print order not found.');return;}
        const unique=[...new Set(indexes)].filter((index)=>order.files[index]);
        if(!unique.length)throw Error('No print files selected.');
        const inputs=[];
        unique.forEach((index)=>{
          const file=order.files[index];
          const absolutePath=path.resolve(process.cwd(),file.stored_path);
          const printRoot=path.resolve(process.cwd(),'maps','print_orders');
          if(!absolutePath.startsWith(printRoot+path.sep)||!fs.existsSync(absolutePath))throw Error('Print file not found.');
          const copies=Math.max(1,Math.min(99,Number(file.copies)||1));
          for(let copy=0;copy<copies;copy+=1)inputs.push(absolutePath);
        });
        const pdf=mergePdfFiles(inputs);
        const label=safeFileStem(parsed.searchParams.get('label')||('Order-'+order.id),'print-order');
        res.statusCode=200;
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition','inline; filename="'+label+'.pdf"');
        res.setHeader('Cache-Control','no-store');
        res.end(pdf);
      }catch(error){res.statusCode=400;res.end(error.message||'Print batch request failed.');}
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
