import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: 'postgresql://horeca1:horeca1_dev@127.0.0.1:5432/horeca1',
  });

  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    console.log('Tables count:', res.rows.length);
    console.log('Sample tables:', res.rows.map((r: any) => r.table_name).slice(0, 10));
    await client.end();
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
