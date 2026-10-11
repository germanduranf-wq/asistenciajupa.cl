import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
// ZIP sin dependencias: método STORE, CRC-32 y rutas relativas portables.
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c >>> 1 ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
async function list(root, exclude = []) {
  let files = [];
  async function walk(dir) {
    for (const e of await readdir(dir, {
      withFileTypes: true
    })) {
      if (exclude.includes(e.name) || e.name.startsWith('.env') && e.name !== '.env.example') continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path);else if (e.isFile()) files.push({
        name: relative(root, path).replaceAll('\\', '/'),
        data: await readFile(path)
      });
    }
  }
  await walk(root);
  return files;
}
async function zip(files, destination) {
  let offset = 0;
  const locals = [],
    centrals = [];
  for (const file of files) {
    const name = Buffer.from(file.name),
      data = file.data,
      crc = crc32(data);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x800, 6);
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(data.length, 18);
    l.writeUInt32LE(data.length, 22);
    l.writeUInt16LE(name.length, 26);
    locals.push(l, name, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    centrals.push(c, name);
    offset += l.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  await writeFile(destination, Buffer.concat([...locals, directory, end]));
}
const root = resolve(import.meta.dirname, '..'),
  output = join(root, 'artifacts');
await mkdir(output, {
  recursive: true
});
await stat(join(root, 'dist/index.html'));
await zip(await list(join(root, 'dist')), join(output, 'asistencia-jupa-web.zip'));
await zip(await list(root, ['node_modules', 'dist', '.git', '.sites-runtime', '.openai', 'artifacts', '.supabase']), join(output, 'asistencia-jupa-codigo.zip'));
console.log('Exportación lista: artifacts/asistencia-jupa-web.zip y artifacts/asistencia-jupa-codigo.zip');
