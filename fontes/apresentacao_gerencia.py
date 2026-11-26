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
        elif nome == "TextBox 82": _troca(novo, "Controle SOx SCM-42  ·  Apresentação à gerência  ·  " + rotulo)
        elif nome == "TextBox 83": _troca(novo, f"{n} / {TOTAL}")
    return s

def cartao(s, x, y, w, h, titulo, corpo, fundo=CLARO, barra=VERDE, ttam=13, ctam=13):
    caixa(s, x, y, w, h, fundo); caixa(s, x, y, 0.08, h, barra)
    texto(s, x + 0.25, y + 0.15, w - 0.4, 0.4, titulo.upper(), ttam - 2, barra, True)
    texto(s, x + 0.25, y + 0.5, w - 0.4, h - 0.6, corpo, ctam, CINZA)

# 1 · Capa (do modelo)
for sh in CAPA.shapes:
    if sh.name == "CaixaDeTexto 29": _troca(sh._element, "Controle SOx SCM-42: do manual ao automático")
    elif sh.name == "CaixaDeTexto 31": _troca(sh._element, "Novembro de 2026")
    elif sh.name == "CaixaDeTexto 1": _troca(sh._element, "Levi Rodrigues De Vasconcelos · BS/SOP/GPS")
    elif sh.name == "CaixaDeTexto 2": _troca(sh._element, "Validação mensal das medições: como era, como ficou, o que ganhamos e como vamos implantar.")

# 2 · Contexto
s = base(2, "Contexto", "O que é o Controle SOx SCM-42")
cartao(s, 0.6, 1.8, 6.0, 2.25, "Objetivo", "Confirmar, todo mês, se a medição de cada contrato foi feita no prazo, provisionada ou ficou fora do prazo. É evidência de controle interno (SOx) e alimenta o ICMC, que compõe o IQGC.", ctam=15)
cartao(s, 6.75, 1.8, 6.0, 2.25, "Tamanho", "231 contratos na competência 10/2026, em várias gerências. Cada um com pedidos, RMs, folhas de serviço (FRS) e notas no SAP.", ctam=15)
cartao(s, 0.6, 4.25, 6.0, 2.25, "Quem participa", "Fiscais e gerentes de cada contrato confirmam os dados. O administrador do controle consolida, cobra e fecha o mês.", ctam=15)
cartao(s, 6.75, 4.25, 6.0, 2.25, "Prazo", "Até o dia 15 do mês seguinte à competência. Depois disso o mês é fechado e vira a evidência oficial.", ctam=15)

# 3 · Como era
s = base(3, "Antes", "Como era: tudo à mão, contrato por contrato")
passos = [("1", "Consultar o SAP", "YSMEDICAO, ME33K e ML81N, um contrato por vez"),
          ("2", "Montar a planilha", "Copiar e classificar à mão: no prazo, provisionado ou fora do prazo"),
          ("3", "Pedir confirmação", "E-mail ou mensagem para cada fiscal e gerente"),
          ("4", "Juntar as respostas", "Respostas espalhadas, consolidadas à mão"),
          ("5", "Fechar o mês", "Planilha editável como evidência")]
w = 2.35
for i, (n, t, c) in enumerate(passos):
    x = 0.6 + i * (w + 0.13)
    caixa(s, x, 1.85, w, 2.3, VERM_CL)
    caixa(s, x + 0.2, 2.0, 0.55, 0.55, VERM, shape=MSO_SHAPE.OVAL)
    texto(s, x + 0.2, 2.0, 0.55, 0.55, n, 18, BRANCO, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    texto(s, x + 0.2, 2.68, w - 0.35, 0.45, t, 14, RGBColor(0x22, 0x22, 0x22), True)
    texto(s, x + 0.2, 3.13, w - 0.35, 1.0, c, 12, CINZA)
texto(s, 0.6, 4.45, 12, 0.4, "O QUE DOÍA", 11, VERM, True)
dores = ["Horas de consulta repetitiva no SAP todo mês", "Risco de erro de digitação e de classificação", "Sem visão de quem já respondeu",
         "Cobrança uma a uma, por mensagem", "Difícil provar o que mudou e quando"]
for i, d in enumerate(dores):
    col, lin = i % 3, i // 3
    texto(s, 0.6 + col * 4.15, 4.85 + lin * 0.75, 4.0, 0.7, [[("✖  ", True, VERM), (d, False, CINZA)]], 14)

# 4 · Como ficou
s = base(4, "Agora", "Como ficou: o programa lê o SAP e o app coleta as respostas")
etapas = [("Programa", "Lê o SAP sozinho (YSMEDICAO, ME33K, ML81N) e classifica cada contrato pela mesma regra", "Dia 1"),
          ("Planilha 01", "Nasce pronta, com a foto do início do mês, e é publicada no app", "Dia 1"),
          ("App", "Fiscal ou gerente abre o contrato e clica em Dados OK ou Dados não OK", "Até o prazo"),
          ("Painel + Teams", "Painel mostra quem falta; nos últimos dias, rascunhos de cobrança prontos", "Últimos dias"),
          ("Planilha 03", "Fechamento gera a versão final, somente leitura, com o que mudou", "Após o prazo")]
for i, (t, c, q) in enumerate(etapas):
    x = 0.6 + i * (w + 0.13)
    caixa(s, x, 1.85, w, 3.0, VERDE_CL)
    caixa(s, x, 1.85, w, 0.5, VERDE)
    texto(s, x + 0.15, 1.85, w - 0.3, 0.5, q.upper(), 11, BRANCO, True, PP_ALIGN.LEFT, MSO_ANCHOR.MIDDLE)
    texto(s, x + 0.2, 2.5, w - 0.35, 0.45, t, 16, VERDE_ESC, True)
    texto(s, x + 0.2, 3.0, w - 0.35, 1.8, c, 12, CINZA)
texto(s, 0.6, 5.15, 12.1, 1.6, [[("Quem acessa o quê: ", True, VERDE_ESC), ("fiscais e gerentes entram sozinhos pelos dados do SAP e só respondem os seus contratos; administradores e editores veem o Painel e a tela de Configurações (perfis, acessos, prazo).", False, CINZA)],
                                [("No meio do mês: ", True, VERDE_ESC), ("Puxar respostas gera a planilha 02 com a aba O que mudou e a conferência do programa.", False, CINZA)]], 14, esp=8)

# 5 · Antes x Depois
s = base(5, "Comparação", "Antes x Depois")
linhas = [("Etapa", "Antes", "Agora"),
          ("Leitura do SAP", "Manual, contrato por contrato", "Automática para todos os contratos"),
          ("Classificação", "Julgamento de cada pessoa", "Mesma regra para todos, pela data da FRS"),
          ("Confirmação", "E-mails e planilhas soltas", "Um app, com Dados OK ou não OK"),
          ("Acompanhamento", "Sem visão do andamento", "Painel por gerência, fiscal e gerente"),
          ("Prazo", "Controle manual", "Trava sozinho; prorrogar ou antecipar em 1 clique"),
          ("Cobrança", "Mensagem por mensagem", "Rascunhos prontos no Teams"),
          ("Evidência SOx", "Planilha editável", "Versões 01, 02 e 03, final somente leitura")]
tb = s.shapes.add_table(len(linhas), 3, Inches(0.6 * S), Inches(1.8 * S), Inches(12.1 * S), Inches(4.9 * S)).table
for j, lw in enumerate([2.6, 4.5, 5.0]): tb.columns[j].width = Inches(lw * S)
for i, lin in enumerate(linhas):
    for j, v in enumerate(lin):
        c = tb.cell(i, j); c.text = v; c.margin_left = Inches(0.15)
        c.fill.solid(); c.fill.fore_color.rgb = VERDE if i == 0 else (VERM_CL if j == 1 else (VERDE_CL if j == 2 else CLARO))
        para = c.text_frame.paragraphs[0]
        for r in para.runs:
            r.font.size = Pt((14 if i else 13) * FS); r.font.bold = (i == 0 or j == 0); r.font.name = FONTE_B if (i == 0 or j == 0) else FONTE
            r.font.color.rgb = BRANCO if i == 0 else (VERM if j == 1 else (VERDE_ESC if j == 2 else CINZA))
        c.vertical_anchor = MSO_ANCHOR.MIDDLE

# 6 · Ganhos
s = base(6, "Resultados", "O que ganhamos")
ganhos = [("Tempo", "≈ __ h/mês", "de consulta ao SAP e montagem da planilha que o programa passa a fazer sozinho"),
          ("Qualidade", "231", "contratos classificados pela mesma regra, com conferência automática das respostas"),
          ("Rastreabilidade", "3 versões", "início (01), acompanhamento (02) e final travada (03), com o que mudou"),
          ("Transparência", "Tempo real", "painel com quem já respondeu, por gerência, fiscal e gerente")]
for i, (t, num, c) in enumerate(ganhos):
    x = 0.6 + i * 3.08
    caixa(s, x, 1.85, 2.92, 4.0, CLARO); caixa(s, x, 1.85, 2.92, 0.08, VERDE)
    texto(s, x + 0.25, 2.1, 2.5, 0.4, t.upper(), 12, VERDE, True)
    destaque = AMARELO if "__" in num else VERDE_ESC
    if "__" in num:
        caixa(s, x + 0.2, 2.6, 2.5, 0.9, RGBColor(0xFF, 0xF4, 0xD6))
    texto(s, x + 0.25, 2.6, 2.45, 0.9, num, 30, VERDE_ESC, True, ancora=MSO_ANCHOR.MIDDLE)
    texto(s, x + 0.25, 3.65, 2.45, 2.1, c, 13, CINZA)
caixa(s, 0.6, 6.05, 12.1, 0.7, VERDE_CL); caixa(s, 0.75, 6.2, 1.2, 0.4, VERDE)
texto(s, 0.75, 6.2, 1.2, 0.4, "TAMBÉM", 10, BRANCO, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
texto(s, 2.15, 6.05, 10.4, 0.7, "Menos risco de erro na evidência SOx e o controle deixa de depender de uma pessoa só: está documentado e pode ser passado adiante.", 13, CINZA, ancora=MSO_ANCHOR.MIDDLE)

# 6b · Relatórios para o SOx
s = base(7, "Auditoria", "O SOx tira os relatórios de qualquer mês direto do app")
passos = [("1", "Escolhe o mês", "Na tela Relatórios, por exemplo 03/2027."),
          ("2", "Vê o resumo", "Contratos, no prazo, provisionado, fora do prazo e quantos foram validados."),
          ("3", "Abre as planilhas", "01 início · 02 acompanhamento · 03 final, somente leitura (a evidência)."),
          ("4", "Confere por contrato", "Quem confirmou e quando (OK por… em…), sem pedir nada a ninguém.")]
for i, (n, t, c) in enumerate(passos):
    x = 0.6 + i * 3.08
    caixa(s, x, 1.85, 2.92, 2.6, CLARO); caixa(s, x, 1.85, 2.92, 0.08, VERDE)
    caixa(s, x + 0.25, 2.1, 0.5, 0.5, VERDE, shape=MSO_SHAPE.OVAL)
    texto(s, x + 0.25, 2.1, 0.5, 0.5, n, 16, BRANCO, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    texto(s, x + 0.25, 2.75, 2.5, 0.45, t, 15, RGBColor(0x22, 0x22, 0x22), True)
    texto(s, x + 0.25, 3.2, 2.5, 1.2, c, 13, CINZA)
cartao(s, 0.6, 4.7, 6.0, 1.3, "Perfil Auditoria SOx", "Só leitura: vê todos os meses, o Painel e os Relatórios. Não altera nada.", ctam=14)
cartao(s, 6.7, 4.7, 6.0, 1.3, "Guardado por mês", "As planilhas ficam no SharePoint, numa pasta por mês (ex.: Relatórios SOx/2027-03).", ctam=14)
caixa(s, 0.6, 6.2, 12.1, 0.55, VERDE_CL); caixa(s, 0.75, 6.28, 1.2, 0.4, VERDE)
texto(s, 0.75, 6.28, 1.2, 0.4, "GANHO", 10, BRANCO, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
texto(s, 2.15, 6.2, 10.4, 0.55, "A auditoria deixa de depender de pedir arquivos por e-mail: tudo de cada mês num lugar só.", 13, CINZA, ancora=MSO_ANCHOR.MIDDLE)

# 7 · Implantação em fases
s = base(8, "Implantação", "Começa em fevereiro, com 6 meses de piloto")
fases = [("Nov/2026 a Jan/2027", "Preparação", "Programa, app, perfis e prazo prontos e testados com a competência 10/2026. Ajustes finais e passagem da rotina.", True),
         ("Fev/2027 a Jul/2027", "Piloto: 6 meses", "Começa com a medição de janeiro (competência 01/2027, prazo 15/02/2027). Fiscais e gerentes conferem TODOS os contratos e clicam em Dados OK ou Dados não OK.", False),
         ("A partir de Ago/2027", "Só exceções", "Com os dados comprovados, todos passam a só visualizar. Só tratam os contratos com provisão ou fora do prazo.", False)]
caixa(s, 1.0, 2.35, 11.3, 0.06, VERDE)
for i, (q, t, c, feito) in enumerate(fases):
    x = 0.6 + i * 4.1
    o = caixa(s, x + 1.7, 2.13, 0.5, 0.5, VERDE if feito else BRANCO, VERDE, MSO_SHAPE.OVAL)
    o.line.width = Pt(3)
    texto(s, x, 1.65, 3.9, 0.4, q, 15, VERDE_ESC, True, PP_ALIGN.CENTER)
    caixa(s, x, 2.9, 3.9, 3.0, CLARO if i != 1 else VERDE_CL); caixa(s, x, 2.9, 0.08, 3.0, VERDE)
    texto(s, x + 0.25, 3.05, 3.5, 0.45, t, 17, RGBColor(0x22, 0x22, 0x22), True)
    texto(s, x + 0.25, 3.55, 3.5, 2.3, c, 13, CINZA)
caixa(s, 0.6, 6.15, 12.1, 0.6, VERDE_CL); caixa(s, 0.75, 6.25, 1.2, 0.4, VERDE)
texto(s, 0.75, 6.25, 1.2, 0.4, "PILOTO", 10, BRANCO, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
texto(s, 2.15, 6.15, 10.4, 0.6, "6 competências (01/2027 a 06/2027) para comprovar que o que o programa lê do SAP bate com o que fiscais e gerentes confirmam.", 13, CINZA, ancora=MSO_ANCHOR.MIDDLE)

# 8 · O que precisamos decidir
s = base(9, "Decisões", "O que precisamos fechar hoje")
decisoes = [("1", "Início em fevereiro de 2027", "Primeira competência no app: 01/2027 (medição de janeiro), prazo 15/02/2027."),
            ("2", "Piloto de 6 meses", "De 01/2027 a 06/2027 todos os contratos são confirmados no app (Dados OK ou não OK)."),
            ("3", "Critério para encerrar o piloto", "Ex.: nos últimos meses, poucos Dados não OK causados por erro de leitura do SAP. Sugestão de meta: __%."),
            ("4", "Depois do piloto: só exceções", "Fiscais e gerentes passam a só visualizar e tratam apenas provisão e fora do prazo."),
            ("5", "Acesso do SOx e comunicação", "Quem do SOx recebe o perfil Auditoria; aviso da gerência aos fiscais e gerentes antes de fevereiro.")]
for i, (n, t, c) in enumerate(decisoes):
    y = 1.8 + i * 0.98
    caixa(s, 0.6, y, 12.1, 0.85, CLARO); caixa(s, 0.6, y, 0.08, 0.85, VERDE)
    caixa(s, 0.85, y + 0.17, 0.5, 0.5, VERDE, shape=MSO_SHAPE.OVAL)
    texto(s, 0.85, y + 0.17, 0.5, 0.5, n, 16, BRANCO, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
    texto(s, 1.6, y + 0.05, 3.9, 0.75, t, 15, RGBColor(0x22, 0x22, 0x22), True, ancora=MSO_ANCHOR.MIDDLE)
    texto(s, 5.5, y + 0.05, 7.1, 0.75, c, 13, CINZA, ancora=MSO_ANCHOR.MIDDLE)

# encerramento do modelo vai para o fim
lista.remove(FIM_ID); lista.append(FIM_ID)

p.save(sys.argv[1]); print("ok", len(p.slides))
