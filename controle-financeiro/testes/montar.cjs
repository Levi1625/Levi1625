// Monta .saida/app-teste.html: o app de verdade (../bolso-em-dia.html) com a família fictícia e um banco de dados de mentira.
// Nenhum dado real entra aqui. Uso: node testes/montar.cjs
const fs = require('fs'), path = require('path');
const AQUI = __dirname, SAIDA = path.join(AQUI, '.saida');
// backup do app ({lancamentos:[…], fixos:[…], …, config:{…}}) → formato da família de teste ({lanc:{id:doc}, …, config:{geral:{…}}})
function doBackup(b) {
  if (!b || !Array.isArray(b.lancamentos)) return b;   // já está no formato da família de teste
  const mapa = a => Object.fromEntries((a || []).map(({id, ...d}) => [id, d]));
  return {lanc:mapa(b.lancamentos), fixos:mapa(b.fixos), cartoes:mapa(b.cartoes), objetivos:mapa(b.objetivos), emprestimos:mapa(b.emprestimos), investimentos:mapa(b.investimentos), config:{geral:b.config || {}}};
}
function montar() {
  fs.mkdirSync(SAIDA, {recursive:true});
  const app = fs.readFileSync(path.join(AQUI, '..', 'bolso-em-dia.html'), 'utf8');
  // Família fictícia por padrão. Para abrir com os dados de um backup do app (Ajustes › Backup › Baixar backup .json):
  //   DADOS=caminho/do/backup.json node testes/montar.cjs   (o arquivo gerado fica em testes/.saida, que não vai para o GitHub)
  const seed = process.env.DADOS ? JSON.stringify(doBackup(JSON.parse(fs.readFileSync(process.env.DADOS, 'utf8')))) : fs.readFileSync(path.join(AQUI, 'familia-teste.json'), 'utf8'), mock = fs.readFileSync(path.join(AQUI, 'mock.js'), 'utf8');
  // funções que os testes usam direto
  const nomes = ['S', 'render', 'fluxo', 'projMes', 'podeGastar', 'saldoHoje', 'saldoVAHoje', 'ajusteMes', 'partesMes', 'linhaMes', 'guardadoMesAMes', 'objGuardado', 'objFalta',
    'fixoPagoPor', 'pagoFixo', 'criarLanc', 'movObj', 'lancDePendente', 'parseRapido', 'lancarTexto', 'resHTML', 'efeitoTxt', 'diaDiaBase', 'eventosFuturos', 'ymNow', 'hoje', 'colchao', 'isVARec', 'valorFixo', 'folgaInfo', 'itensMes', 'mediaPool', 'ehPool', 'cartaoPrincipal', 'enviarChat', 'alertasMes',
    'comidaMes', 'proxAperto', 'inteiros', 'repartir', 'avisosHoje', 'objTetos', 'saveCfg', 'difCfg', 'projPool', 'tetoDia'];
  const i = app.lastIndexOf('})();'); if (i < 0) throw new Error('não achei o fim do app');
  const comT = app.slice(0, i) + `window.__T = {${nomes.join(', ')}};\n` + app.slice(i);
  const html = `<!doctype html><html><head><meta charset=utf8></head><body><script>window.__SEED=${seed}</script><script>${mock}</script>${comT}`;
  fs.writeFileSync(path.join(SAIDA, 'app-teste.html'), html);
  return path.join(SAIDA, 'app-teste.html');
}
module.exports = montar;
if (require.main === module) console.log(montar());
