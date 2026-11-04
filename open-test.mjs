import open from 'open';
const target = process.argv[2];
console.log('opening:', target, 'cwd:', process.cwd());
try {
  const cp = await open(target);
  console.log('spawned pid:', cp.pid);
} catch (e) {
  console.error('ERROR:', e);
}
