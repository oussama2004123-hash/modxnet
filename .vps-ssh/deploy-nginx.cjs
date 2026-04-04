const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const password = process.env.VPS_SSH_PASSWORD;
if (!password) {
  console.error('Set VPS_SSH_PASSWORD');
  process.exit(1);
}

const content = fs.readFileSync(path.join(__dirname, 'nginx-modxnet.conf'), 'utf8');
const conn = new Client();

conn
  .on('ready', () => {
    conn.sftp((err, sftp) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      const remote = '/etc/nginx/sites-available/modxnet';
      const w = sftp.createWriteStream(remote);
      w.on('error', (e) => {
        console.error(e);
        conn.end();
        process.exit(1);
      });
      w.on('close', () => {
        conn.exec(
          'mkdir -p /var/www/html && nginx -t && systemctl reload nginx && echo OK',
          (e2, stream) => {
            if (e2) {
              console.error(e2);
              conn.end();
              process.exit(1);
            }
            stream
              .on('close', (code) => {
                conn.end();
                process.exit(code === 0 ? 0 : 1);
              })
              .on('data', (d) => process.stdout.write(d))
              .stderr.on('data', (d) => process.stderr.write(d));
          }
        );
      });
      w.write(content);
      w.end();
    });
  })
  .on('error', (e) => {
    console.error('SSH:', e.message);
    process.exit(1);
  })
  .connect({
    host: process.env.VPS_HOST || '156.67.28.181',
    port: 22,
    username: process.env.VPS_USER || 'root',
    password,
    readyTimeout: 30000
  });
