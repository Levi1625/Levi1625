// Monta .saida/app-teste.html: o app de verdade (../bolso-em-dia.html) com a família fictícia e um banco de dados de mentira.
// Nenhum dado real entra aqui. Uso: node testes/montar.cjs
const fs = require('fs'), path = require('path');
const AQUI = __dirname, SAIDA = path.join(AQUI, '.saida');
function montar() {
  fs.mkdirSync(SAIDA, {recursive:true});
  const app = fs.readFileSync(path.join(AQUI, '..', 'bolso-em-dia.html'), 'utf8');
  const seed = fs.readFileSync(path.join(AQUI, 'familia-teste.json'), 'utf8'), mock = fs.readFileSync(path.join(AQUI, 'mock.js'), 'utf8');
  // funções que os testes usam direto
  const nomes = ['S', 'render', 'fluxo', 'projMes', 'podeGastar', 'saldoHoje', 'saldoVAHoje', 'ajusteMes', 'partesMes', 'linhaMes', 'guardadoMesAMes', 'objGuardado', 'objFalta',
    'fixoPagoPor', 'pagoFixo', 'criarLanc', 'movObj', 'lancDePendente', 'parseRapido', 'lancarTexto', 'resHTML', 'efeitoTxt', 'eventosFuturos', 'ymNow', 'hoje', 'colchao', 'isVARec'];
  const i = app.lastIndexOf('})();'); if (i < 0) throw new Error('não achei o fim do app');
  const comT = app.slice(0, i) + `window.__T = {${nomes.join(', ')}};\n` + app.slice(i);
  const html = `<!doctype html><html><head><meta charset=utf8></head><body><script>window.__SEED=${seed}</script><script>${mock}</script>${comT}`;
  fs.writeFileSync(path.join(SAIDA, 'app-teste.html'), html);
  return path.join(SAIDA, 'app-teste.html');
}
module.exports = montar;
if (require.main === module) console.log(montar());
