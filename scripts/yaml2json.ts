const text = await Bun.file('src/api/bot/i18n.yaml').text();
const parsed = Bun.YAML.parse(text) as Record<string, unknown>;
await Bun.write('src/api/bot/i18n.json', JSON.stringify(parsed, null, '\t') + '\n');
console.log('keys:', Object.keys(parsed).length);
