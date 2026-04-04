const { Client } = require('ssh2');

const host = process.env.VPS_HOST || '156.67.28.181';
const user = process.env.VPS_USER || 'root';
const password = process.env.VPS_SSH_PASSWORD;
const cmd = process.argv.slice(2).join(' ') || 'uname -a';

if (!password) {
  console.error('Set VPS_SSH_PASSWORD');
  process.exit(1);
}

const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      stream
        .on('close', (code) => {
          conn.end();
          process.exit(typeof code === 'number' ? code : 0);
        })
        .on('data', (d) => process.stdout.write(d))
        .stderr.on('data', (d) => process.stderr.write(d));
    });
  })
  .on('error', (e) => {
    console.error('SSH error:', e.message);
    process.exit(1);
  })
  .connect({
    host,
    port: 22,
    username: user,
    password,
    readyTimeout: 30000
  });
