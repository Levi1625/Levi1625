import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

VERDE = RGBColor(0x00, 0x85, 0x42); VERDE_ESC = RGBColor(0x00, 0x5C, 0x2E)
AMARELO = RGBColor(0xFD, 0xB9, 0x13); CINZA = RGBColor(0x4A, 0x4A, 0x4A)
CLARO = RGBColor(0xF3, 0xF6, 0xF4); BRANCO = RGBColor(0xFF, 0xFF, 0xFF)
VERM = RGBColor(0xB4, 0x23, 0x18); VERM_CL = RGBColor(0xFB, 0xEC, 0xEA)
VERDE_CL = RGBColor(0xE6, 0xF3, 0xEC); FONTE = "Inter"
LARANJA = RGBColor(0xF0, 0x8A, 0x00); CLARO = RGBColor(0xF5, 0xF6, 0xF5)

import copy
MODELO = sys.argv[2]
p = Presentation(MODELO)
S = 1.2; FS = 1.2
TOTAL = 10
VERDE = RGBColor(0x00, 0x85, 0x42); CLARO = RGBColor(0xE8, 0xE8, 0xE8); FONTE = "Petrobras Sans"; FONTE_B = "Petrobras Sans XBold"
lista = p.slides._sldIdLst; ids = list(lista)
def _remover(sid):
    rid = sid.rId; lista.remove(sid)
    if rid in p.part.rels: p.part.rels.pop(rid)
MODELO_INTERNO = p.slides[2]
MOLDE = {sh.name: copy.deepcopy(sh._element) for sh in MODELO_INTERNO.shapes if sh.name in ("CaixaDeTexto 36", "CaixaDeTexto 44", "TextBox 82", "TextBox 83", "Elipse 1")}
CAPA = p.slides[0]; FIM_ID = ids[-1]
for sid in ids[1:-1]: _remover(sid)
ext = p.part._element
for tag in ("custShowLst", "sectionLst"):
    for el in ext.iter():
        pass
from lxml import etree
for el in list(ext):
    if etree.QName(el).localname in ("custShowLst",):
        ext.remove(el)
for el in ext.iter("{http://schemas.microsoft.com/office/powerpoint/2010/main}sectionLst"):
    el.getparent().remove(el); break
LAYOUT = [l for l in p.slide_layouts if l.name == "Logo_Direita"][0]
def _troca(el, *textos):
    """Troca o texto mantendo a formatação do primeiro run de cada parágrafo."""
    ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
    paras = el.findall(".//" + ns + "p")
    for par, txt in zip(paras, textos):
        runs = par.findall(ns + "r")
        if not runs: continue
        runs[0].find(ns + "t").text = txt
        for r in runs[1:]: par.remove(r)
def caixa(s, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE):
    b = s.shapes.add_shape(shape, Inches(x * S), Inches(y * S), Inches(w * S), Inches(h * S))
    if fill is None: b.fill.background()
    else: b.fill.solid(); b.fill.fore_color.rgb = fill
    if line is None: b.line.fill.background()
    else: b.line.color.rgb = line; b.line.width = Pt(1)
    b.shadow.inherit = False
    return b

def texto(s, x, y, w, h, linhas, tam=16, cor=CINZA, negrito=False, alin=PP_ALIGN.LEFT, ancora=MSO_ANCHOR.TOP, esp=4):
    t = s.shapes.add_textbox(Inches(x * S), Inches(y * S), Inches(w * S), Inches(h * S)).text_frame
    t.word_wrap = True; t.vertical_anchor = ancora
    t.margin_left = t.margin_right = Inches(0.05); t.margin_top = t.margin_bottom = Inches(0.02)
    if isinstance(linhas, str): linhas = [linhas]
    for i, l in enumerate(linhas):
        par = t.paragraphs[0] if i == 0 else t.add_paragraph()
        par.alignment = alin; par.space_after = Pt(esp)
        partes = l if isinstance(l, list) else [(l, negrito, cor)]
        for item in partes:
            txt, ng, c = (item + (cor,))[:3] if isinstance(item, tuple) and len(item) == 2 else item
            r = par.add_run(); r.text = txt; r.font.size = Pt(tam * FS); r.font.bold = ng; r.font.color.rgb = c; r.font.name = FONTE_B if ng else FONTE
    return t

def base(n, rotulo, titulo):
    s = p.slides.add_slide(LAYOUT)
    from pptx.opc.packuri import PackURI
    s.part.partname = PackURI(f"/ppt/slides/slide{900 + n}.xml")
    for nome, el in MOLDE.items():
        novo = copy.deepcopy(el); s.shapes._spTree.append(novo)
        if nome == "CaixaDeTexto 44": _troca(novo, rotulo)
        elif nome == "CaixaDeTexto 36": _troca(novo, titulo, "—")
        elif nome == "TextBox 82": _troca(novo, "Projetos de tecnologia  ·  BS/SOP/GPS  ·  " + rotulo)
        elif nome == "TextBox 83": _troca(novo, f"{n} / {TOTAL}")
    return s

def cartao(s, x, y, w, h, titulo, corpo, fundo=CLARO, barra=VERDE, ttam=13, ctam=13):
    caixa(s, x, y, w, h, fundo); caixa(s, x, y, 0.08, h, barra)
    texto(s, x + 0.25, y + 0.15, w - 0.4, 0.4, titulo.upper(), ttam - 2, barra, True)
    texto(s, x + 0.25, y + 0.5, w - 0.4, h - 0.6, corpo, ctam, CINZA)


LARANJA = RGBColor(0xF0, 0x8A, 0x00); AMBAR_CL = RGBColor(0xFF, 0xF1, 0xD6); AZUL = RGBColor(0x1D, 0x5F, 0x96); AZUL_CL = RGBColor(0xE4, 0xEE, 0xF7)
PRETO = RGBColor(0x22, 0x22, 0x22)
ST = {"Concluído": (VERDE, VERDE_CL), "Em andamento": (LARANJA, AMBAR_CL), "Planejado": (AZUL, AZUL_CL)}

def selo(s, x, y, status, w=1.75):
    cor, fundo = ST[status]
    caixa(s, x, y, w, 0.34, fundo, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    texto(s, x, y, w, 0.34, status.upper(), 9, cor, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)

def barra(s, x, y, w, pct, status, rotulo=True):
    cor = ST[status][0]
    caixa(s, x, y, w, 0.16, RGBColor(0xDD, 0xDD, 0xDD), shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    if pct > 0: caixa(s, x, y, max(0.16, w * pct / 100), 0.16, cor, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    if rotulo: texto(s, x + w + 0.1, y - 0.1, 0.9, 0.36, f"{pct}%", 12, PRETO, True, ancora=MSO_ANCHOR.MIDDLE)

PROJ = [
  dict(nome="Projeto Automação SOX ICMC", curto="Validação mensal das medições (SOx / ICMC) com app Power Apps", status="Em andamento", pct=80, entrega="Fev/2027", obs="início do piloto de 6 meses",
       faz="Programa lê o SAP (YSMEDICAO, ME33K, ML81N), classifica no prazo, provisionado ou fora do prazo, e publica no app onde fiscais e gerentes validam. Gera as planilhas 01, 02 e 03 (evidência SOx).",
       feito=["Programa de leitura do SAP e classificação", "App: contratos, Painel do mês, Apoio e Configurações (perfis, acessos, prazo)", "Testado com a competência 10/2026 (231 contratos)", "Manuais e roteiro passo a passo"],
       falta=["Tela Relatórios e perfil Auditoria SOx", "Lembretes de cobrança no Teams (rascunhos)", "Passagem para a pessoa responsável", "Piloto fev a jul/2027; depois só exceções"]),
  dict(nome="Padronização e automação das planilhas de controle de postos e controle de pessoal da CS2", curto="Planilhas padronizadas por contrato, Base Terceirizados e painel Power BI", status="Em andamento", pct=90, entrega="Dez/2026*", obs="testes finais da versão 4",
       faz="Planilhas padronizadas por contrato (postos, pessoas, documentos, embarques) que alimentam a Base Terceirizados e o painel Power BI de controle documental, com atualização de versão automática.",
       feito=["Modelos Controle de Postos e Controle SISPAT (manutenção)", "Base Terceirizados e painel Power BI", "Atualização automática de versão (v4 de 25/11/2026)", "Manuais e apresentações de treinamento"],
       falta=["Concluir testes com as planilhas reais dos contratos", "Passar todos os contratos para a versão 4", "Treinar a equipe"]),
  dict(nome="Robô de atualização de novos campos PrestServ", curto="Atualiza os novos campos dos colaboradores no PrestServ", status="Concluído", pct=100, entrega="Nov/2026", obs="concluído",
       faz="Robô que preenche os novos campos no PrestServ a partir de uma planilha, colaborador por colaborador, com registro de cada passo e tratamento de erros.",
       feito=["Atualização dos novos campos funcionando", "Ajustes de desempenho para lotes grandes (mais de 1.000 colaboradores)", "Concluído em novembro/2026"], falta=["Só manutenção"]),
  dict(nome="Automação da baixa, arquivamento e envio do e-mail dos itens da medição", curto="Do Pedido no SAP ao e-mail da medição pronto", status="Concluído", pct=100, entrega="Out/2026", obs="em produção, manual v5.4",
       faz="Abre Pedido, FRS e RM no SAP, baixa os PDFs, monta e valida o espelho da NF, arquiva no SharePoint e deixa o e-mail pronto no Outlook.",
       feito=["Em produção", "Histórico e retomada de onde parou", "Manual de uso completo (v5.4)"], falta=["Só manutenção e melhorias"]),
  dict(nome="Automação de Certidões", curto="CNDT, CRF e CND das contratadas sempre em dia", status="Concluído", pct=100, entrega="Out/2026*", obs="em produção, roda todo dia 25",
       faz="Emite e baixa as certidões nos portais do governo por CNPJ, resolve o captcha e roda sozinha pelo agendador do Windows, lendo a lista de contratos do SharePoint.",
       feito=["Em produção", "Agendada todo dia 25", "Novo contrato entra sem mudar código"], falta=["Só manutenção"]),
  dict(nome="Automação da medição no SAP", curto="Cria Pedido, FRS, RM e NL no SAP e acompanha a medição até o fim (pós-medição)", status="Em andamento", pct=80, entrega="1º sem/2027*", obs="em desenvolvimento",
       faz="Calcula reajuste, consulta a PPU, valida os serviços e cria Pedido, FRS, RM e NL no SAP. Depois acompanha a medição enviada até a confirmação final e avisa qualquer pendência (pós-medição).",
       feito=["15 etapas mapeadas e automatizadas", "Fluxo de ponta a ponta desenhado", "Primeiras consultas de pós-medição em teste"],
       falta=["Concluir e testar com contratos reais", "Unificar com a automação da baixa e envio do e-mail", "Pós-medição: acompanhar Pedido, FRS, RM e NL até a confirmação"]),
]

# 1 · Capa
for sh in CAPA.shapes:
    if sh.name == "CaixaDeTexto 29": _troca(sh._element, "Projetos de tecnologia da gerência")
    elif sh.name == "CaixaDeTexto 31": _troca(sh._element, "Novembro de 2026")
    elif sh.name == "CaixaDeTexto 1": _troca(sh._element, "Levi Rodrigues De Vasconcelos · BS/SOP/GPS")
    elif sh.name == "CaixaDeTexto 2": _troca(sh._element, "Como está cada automação: concluídas, em andamento e planejadas, com o percentual e a data de entrega.")

# 2 · Visão geral
s = base(2, "Portfólio", "Como estão os projetos")
n = {k: sum(1 for p in PROJ if p["status"] == k) for k in ST}
cards = [("Projetos", len(PROJ), PRETO, CLARO), ("Concluídos", n["Concluído"], VERDE, VERDE_CL), ("Em andamento", n["Em andamento"], LARANJA, AMBAR_CL), ("Planejados", n["Planejado"], AZUL, AZUL_CL)]
for i, (t, v, c, f) in enumerate(cards):
    x = 0.6 + i * 3.08
    caixa(s, x, 1.75, 2.92, 1.05, f); caixa(s, x, 1.75, 0.08, 1.05, c)
    texto(s, x + 0.3, 1.8, 1.2, 0.95, str(v), 32, c, True, ancora=MSO_ANCHOR.MIDDLE)
    texto(s, x + 1.25, 1.8, 1.6, 0.95, t, 14, PRETO, True, ancora=MSO_ANCHOR.MIDDLE)
y0 = 3.05
texto(s, 0.6, y0, 4.6, 0.3, "PROJETO", 9, VERDE, True); texto(s, 5.3, y0, 1.9, 0.3, "STATUS", 9, VERDE, True)
texto(s, 7.35, y0, 3.2, 0.3, "CONCLUÍDO", 9, VERDE, True); texto(s, 10.8, y0, 1.9, 0.3, "ENTREGA", 9, VERDE, True)
for i, pj in enumerate(PROJ):
    y = y0 + 0.36 + i * 0.52
    caixa(s, 0.6, y, 12.1, 0.48, CLARO if i % 2 == 0 else BRANCO)
    texto(s, 0.7, y, 4.55, 0.48, pj["nome"], 10, PRETO, True, ancora=MSO_ANCHOR.MIDDLE, esp=0)
    selo(s, 5.3, y + 0.07, pj["status"])
    barra(s, 7.35, y + 0.16, 2.4, pj["pct"], pj["status"])
    texto(s, 10.8, y, 1.9, 0.48, pj["entrega"], 12, PRETO, True, ancora=MSO_ANCHOR.MIDDLE)
texto(s, 0.6, 6.72, 12.1, 0.3, "* data estimada a confirmar. Percentuais estimados a partir do que já foi entregue em cada projeto.", 9, CINZA)

# 3..9 · um slide por projeto
for k, pj in enumerate(PROJ):
    s = base(3 + k, "Projeto " + str(k + 1) + " de " + str(len(PROJ)), pj["nome"])
    texto(s, 0.6, 1.62, 8.0, 0.4, pj["curto"], 14, CINZA)
    caixa(s, 0.6, 2.1, 12.1, 1.0, CLARO)
    texto(s, 0.8, 2.15, 1.5, 0.35, "STATUS", 9, VERDE, True); selo(s, 0.8, 2.5, pj["status"], 2.0)
    texto(s, 3.2, 2.15, 4.5, 0.35, "CONCLUÍDO", 9, VERDE, True); barra(s, 3.2, 2.62, 4.0, pj["pct"], pj["status"])
    texto(s, 8.6, 2.15, 3.9, 0.35, "ENTREGA", 9, VERDE, True)
    texto(s, 8.6, 2.42, 3.9, 0.6, [[(pj["entrega"], True, PRETO), ("  ·  " + pj["obs"], False, CINZA)]], 15)
    cartao(s, 0.6, 3.3, 12.1, 1.15, "O que faz", pj["faz"], ctam=13)
    cartao(s, 0.6, 4.6, 5.98, 2.0, "Já entregue", ["✔  " + t for t in pj["feito"]], ctam=13)
    cartao(s, 6.72, 4.6, 5.98, 2.0, "Falta", ["•  " + t for t in pj["falta"]], barra=LARANJA, ctam=13)
    if "*" in pj["entrega"]:
        texto(s, 0.6, 6.72, 12.1, 0.3, "* data estimada a confirmar.", 9, CINZA)

# 10 · Modelo para novos projetos
s = base(9, "Modelo", "[Nome do projeto]")
texto(s, 0.6, 1.62, 8.0, 0.4, "[Uma frase: o que o projeto resolve]", 14, CINZA)
caixa(s, 0.6, 2.1, 12.1, 1.0, CLARO)
texto(s, 0.8, 2.15, 1.5, 0.35, "STATUS", 9, VERDE, True); selo(s, 0.8, 2.5, "Em andamento", 2.0)
texto(s, 3.2, 2.15, 4.5, 0.35, "CONCLUÍDO", 9, VERDE, True); barra(s, 3.2, 2.62, 4.0, 50, "Em andamento")
texto(s, 8.6, 2.15, 3.9, 0.35, "ENTREGA", 9, VERDE, True); texto(s, 8.6, 2.42, 3.9, 0.6, "[Mês/Ano]", 15, PRETO, True)
cartao(s, 0.6, 3.3, 12.1, 1.15, "O que faz", "[Como funciona, em duas linhas]", ctam=13)
cartao(s, 0.6, 4.6, 5.98, 2.0, "Já entregue", ["✔  [item]", "✔  [item]"], ctam=13)
cartao(s, 6.72, 4.6, 5.98, 2.0, "Falta", ["•  [item]", "•  [item]"], barra=LARANJA, ctam=13)
texto(s, 0.6, 6.72, 12.1, 0.3, "Para um projeto novo: duplique este slide, troque os textos e ajuste a barra (o tamanho da parte colorida = o percentual). Inclua também uma linha no slide 2.", 9, CINZA)

lista.remove(FIM_ID); lista.append(FIM_ID)
p.save(sys.argv[1]); print("ok", len(p.slides))
