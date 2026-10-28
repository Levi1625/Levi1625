# -*- coding: utf-8 -*-
"""Ajuste "direto": publicar, apagar sobras, fechar e reabrir sem o fluxo SOx Ponte.

Para o código novo (o que já publica por cookie no site da equipe).
Uso:  python ajuste_direto.py "Controle_SOx_SCM42.py"
Faz cópia .bak antes de gravar. Rodar duas vezes não estraga nada.
"""
import shutil
import sys
from pathlib import Path

AJUSTES = [
    ('SharePoint: espera e repete quando pede pausa (429)',
     'def _ponte_http(metodo: str, url: str, cookies: str, corpo: bytes | None = None,\n                digest: str = "", tipo: str = "application/octet-stream", *,\n                merge: bool = False, timeout: int = 60) -> tuple[int, bytes]:\n    import ssl\n    import urllib.error\n    import urllib.request\n    from urllib.parse import urlparse\n\n    cab = {"Accept": "application/json;odata=verbose", "Cookie": cookies, "User-Agent": "Mozilla/5.0"}\n    if digest:\n        cab["X-RequestDigest"] = digest\n    if merge:\n        cab["X-HTTP-Method"] = "MERGE"\n        cab["IF-MATCH"] = "*"\n    if corpo is not None:\n        cab["Content-Type"] = tipo\n    req = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)\n    try:\n        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=timeout) as resp:\n            # Cookie vencido: o SharePoint manda para a tela de login da Microsoft.\n            if urlparse(resp.geturl()).netloc.lower() != urlparse(url).netloc.lower():\n                return 401, b"login expirado"\n            return resp.status, resp.read()\n    except urllib.error.HTTPError as exc:\n        return exc.code, exc.read()\n\n\n',
     'def _ponte_http(metodo: str, url: str, cookies: str, corpo: bytes | None = None,\n                digest: str = "", tipo: str = "application/octet-stream", *,\n                merge: bool = False, timeout: int = 60, apagar: bool = False) -> tuple[int, bytes]:\n    import ssl\n    import time\n    import urllib.error\n    import urllib.request\n    from urllib.parse import urlparse\n\n    cab = {"Accept": "application/json;odata=verbose", "Cookie": cookies, "User-Agent": "Mozilla/5.0"}\n    if digest:\n        cab["X-RequestDigest"] = digest\n    if merge or apagar:\n        cab["X-HTTP-Method"] = "DELETE" if apagar else "MERGE"\n        cab["IF-MATCH"] = "*"\n    if corpo is not None:\n        cab["Content-Type"] = tipo\n    for tentativa in range(5):\n        req = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)\n        try:\n            with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=timeout) as resp:\n                # Cookie vencido: o SharePoint manda para a tela de login da Microsoft.\n                if urlparse(resp.geturl()).netloc.lower() != urlparse(url).netloc.lower():\n                    return 401, b"login expirado"\n                return resp.status, resp.read()\n        except urllib.error.HTTPError as exc:\n            # 429/503: o SharePoint pede pausa quando recebe muitas gravações seguidas.\n            if exc.code in (429, 503) and tentativa < 4:\n                try:\n                    espera = int(exc.headers.get("Retry-After") or 0)\n                except ValueError:\n                    espera = 0\n                espera = min(espera or 5 * (tentativa + 1), 60)\n                print(f"  SharePoint pediu pausa (HTTP {exc.code}); esperando {espera} s...", flush=True)\n                time.sleep(espera)\n                continue\n            return exc.code, exc.read()\n    return 429, b"limite do SharePoint"\n\n\n'),
    ('Publicar: lê só a competência, segue páginas e não apaga respostas do app',
     '    status, existentes_json = _rest_json(\n        cookies,\n        f"{site}/_api/web/lists/getbytitle(\'{lista}\')/items?$top=5000&$select=Id,ChaveUnica,Competencia",\n    )\n    mapa: dict[str, int] = {}\n    if status == 200:\n        for it in (existentes_json.get("d") or {}).get("results") or []:\n            chave = str(it.get("ChaveUnica") or "").strip()\n            if chave and it.get("Id"):\n                mapa[chave] = int(it["Id"])\n',
     '    from urllib.parse import quote as urlquote\n\n    # Só a competência publicada (coluna indexada) e seguindo as páginas: com a lista\n    # crescendo mês a mês, $top=5000 sem filtro deixaria contratos de fora e duplicaria.\n    comp = str((linhas[0].get("Competencia") if linhas else "") or "")\n    manuais = ",".join(dict.fromkeys(_CAMPOS_MANUAIS_NUVEM))\n    url = (\n        f"{site}/_api/web/lists/getbytitle(\'{lista}\')/items?$top=5000"\n        f"&$select=Id,ChaveUnica,{manuais}&$filter=" + urlquote(f"Competencia eq \'{comp}\'")\n    )\n    mapa: dict[str, int] = {}\n    existentes: dict[str, dict[str, Any]] = {}\n    while url:\n        status, existentes_json = _rest_json(cookies, url)\n        if status != 200:\n            raise RuntimeError(\n                f"Não li os contratos já publicados (HTTP {status}); nada foi gravado para não duplicar. "\n                f"{existentes_json.get(\'texto\', \'\')}"\n            )\n        bloco = existentes_json.get("d") or {}\n        for it in bloco.get("results") or []:\n            chave = str(it.get("ChaveUnica") or "").strip()\n            if chave and it.get("Id"):\n                mapa[chave] = int(it["Id"])\n                existentes[chave] = it\n        url = bloco.get("__next") or ""\n    novas = {str(l.get("ChaveUnica") or "") for l in linhas}\n    sobras = [(chave, iid) for chave, iid in mapa.items() if chave not in novas]\n'),
    ('Publicar: mantém o que o pessoal respondeu',
     '        body = _sp_payload_item(entity, linha, {"Id": mapa[chave]} if chave in mapa else None)\n',
     '        # Com os campos atuais da lista: o que o pessoal respondeu no app não é apagado.\n        body = _sp_payload_item(entity, linha, existentes.get(chave))\n'),
    ('Apagar sobras e fechar/reabrir direto (funções novas)',
     '    return {"criados": criados, "atualizados": atualizados, "falhas": falhas}\n\n\ndef _listar_itens_rest(',
     '    return {"criados": criados, "atualizados": atualizados, "falhas": falhas, "sobras": sobras}\n\n\ndef _rest_digest(site: str, cookies: str) -> str:\n    status, corpo = _ponte_http(\n        "POST", f"{site}/_api/contextinfo", cookies, b"", tipo="application/json;odata=verbose"\n    )\n    if status != 200:\n        return ""\n    info = json.loads(corpo.decode("utf-8", errors="replace"))\n    return (info.get("d") or {}).get("GetContextWebInformation", {}).get("FormDigestValue", "")\n\n\ndef _rest_apagar_sobras(\n    site: str, lista: str, cookies: str, sobras: list[tuple[str, int]], total_planilha: int, competencia: date\n) -> int:\n    """A lista do mês fica igual à planilha: apaga o contrato da competência que saiu dela."""\n    if not sobras or not total_planilha:\n        return 0\n    if len(sobras) > max(10, total_planilha // 2):\n        print(\n            f"ATENÇÃO: {len(sobras)} contratos de {competencia:%m/%Y} na lista não estão na planilha. "\n            "São muitos; não apaguei nada. Confira se a competência está certa.",\n            flush=True,\n        )\n        return 0\n    nomes = ", ".join(chave.split("|")[-1] for chave, _ in sobras[:10])\n    print(f"Apagando da lista {len(sobras)} contrato(s) que saíram da planilha: {nomes}", flush=True)\n    digest = _rest_digest(site, cookies)\n    apagados = 0\n    for chave, iid in sobras:\n        status, resposta = _ponte_http(\n            "POST", f"{site}/_api/web/lists/getbytitle(\'{lista}\')/items({iid})", cookies, b"", digest,\n            "application/json;odata=verbose", apagar=True,\n        )\n        if status in (200, 204):\n            apagados += 1\n        else:\n            print(f"  não apaguei {chave}: HTTP {status} {resposta.decode(\'utf-8\', errors=\'replace\')[:120]}", flush=True)\n    print(f"Apagados: {apagados}.", flush=True)\n    return apagados\n\n\ndef _rest_marcar_mes(competencia: date, fechada: bool) -> dict[str, Any]:\n    """Fechar/reabrir direto na lista: só MesFechado em cada contrato, um MERGE por item."""\n    site, cookies, digest = _rest_sessao_site()\n    lista = str(garantir_config_nuvem().get("lista_contratos") or "SOx_SCM42_Contratos")\n    status, info = _rest_json(\n        cookies, f"{site}/_api/web/lists/getbytitle(\'{lista}\')?$select=ListItemEntityTypeFullName"\n    )\n    if status != 200:\n        raise RuntimeError(f"Não abri a lista {lista}: HTTP {status} {info.get(\'texto\', \'\')}")\n    entity = (info.get("d") or {}).get("ListItemEntityTypeFullName") or "SP.Data.SOx_x005f_SCM42_x005f_ContratosListItem"\n    itens = _listar_itens_rest(site, lista, cookies, competencia)\n    flag = "SIM" if fechada else "NÃO"\n    base = f"{site}/_api/web/lists/getbytitle(\'{lista}\')/items"\n    ok = falha = 0\n    for i, it in enumerate(itens, 1):\n        if i % 40 == 0:\n            digest = _rest_digest(site, cookies) or digest\n        status, _resp = _rest_json(\n            cookies, f"{base}({it[\'Id\']})", digest, {"__metadata": {"type": entity}, "MesFechado": flag}, merge=True\n        )\n        if status in (200, 204):\n            ok += 1\n            it["MesFechado"] = flag\n        else:\n            falha += 1\n        if not fechada:\n            # Se algum fechamento antigo separou a permissão do item, ela volta a ser a da lista.\n            _ponte_http("POST", f"{base}({it[\'Id\']})/resetroleinheritance", cookies, b"", digest,\n                        "application/json;odata=verbose")\n        if i % 25 == 0 or i == len(itens):\n            print(f"  MesFechado={flag}: {i}/{len(itens)} (falhas {falha})", flush=True)\n    return {"ok": ok, "falha": falha, "total": len(itens), "itens": itens}\n\n\ndef _listar_itens_rest('),
    ('Puxar: traz as respostas do app (OkFiscal, Não OK…)',
     '        "Fornecedor,Observacao,FRSPendentes,Provisao"\n    )',
     '        "Fornecedor,Observacao,FRSPendentes,Provisao,Gerente,GerenteEmail,MesFechado,"\n        "OkFiscal,OkFiscalPor,OkFiscalEm,DadosCorretos,CampoErro,ValorCorreto,ComentarioErro"\n    )'),
    ('Publicar: sem pedido duplicado ao fluxo; apaga o que saiu da planilha',
     '    marca = _publicar_itens_rest(site, lista, cookies, digest, linhas)\n    itens_fluxo = []\n    for linha in linhas:\n        chave = linha.get("ChaveUnica") or ""\n        if not chave:\n            continue\n        novo = _sp_payload_item("SP.Data", linha, None)\n        novo.pop("__metadata", None)\n        atualiza = {k: v for k, v in novo.items() if k not in _PONTE_DO_APP}\n        itens_fluxo.append({"chave": chave, "novo": novo, "atualiza": atualiza})\n    _ponte_pedido("publicar", competencia, colunas=_ponte_colunas(lista), itens=itens_fluxo)\n',
     '    marca = _publicar_itens_rest(site, lista, cookies, digest, linhas)\n    apagados = _rest_apagar_sobras(site, lista, cookies, marca.get("sobras") or [], len(linhas), competencia)\n'),
    ('Publicar: mensagem com os apagados',
     '            f"Falhas: {marca[\'falhas\']}\\n\\n"\n            f"O pessoal preenche na lista.',
     '            f"Falhas: {marca[\'falhas\']}\\n"\n            f"Apagados (saíram da planilha): {apagados}\\n\\n"\n            f"O pessoal preenche na lista.'),
    ('Fechar: MesFechado direto, sem fluxo',
     '    print(f"Fechando {chave}: o fluxo marca MesFechado=SIM e deixa só leitura...", flush=True)\n    pid = _ponte_pedido("fechar", competencia)\n    itens = _ponte_esperar_lista(competencia, pid, minutos=30)\n',
     '    print(f"Fechando {chave}: MesFechado=SIM direto na lista (sem fluxo)...", flush=True)\n    marca = _rest_marcar_mes(competencia, True)\n    itens = marca["itens"]\n'),
    ('Fechar: resumo do fechamento',
     '        "trava": {"modo": "fluxo SOx Ponte", "itens": len(itens)},\n        "copia_controle": str(copia),\n        "regra": "Depois do fechamento, só o grupo de Proprietários do site edita a lista.",',
     '        "trava": {"modo": "MesFechado direto na lista", "ok": marca["ok"], "falha": marca["falha"]},\n        "copia_controle": str(copia),\n        "regra": "Com MesFechado = SIM o app só deixa o administrador responder.",'),
    ('Reabrir: direto, sem fluxo',
     '    pid = _ponte_pedido("reabrir", competencia)\n    itens = _ponte_esperar_lista(competencia, pid, minutos=30)\n    print(f"Competência {chave} REABERTA.", flush=True)',
     '    marca = _rest_marcar_mes(competencia, False)\n    itens = marca["itens"]\n    print(f"Competência {chave} REABERTA.", flush=True)'),
    ('Observação Mês: troca o nome da coluna da versão anterior deste ajuste',
     '_REST_CACHE: dict[str, bool] = {}\n\n\ndef _rest_garantir_obs_mes(site: str, lista: str, cookies: str) -> None:\n    """Coluna em que fiscal ou gerente escreve a observação do mês pelo app."""\n    if _REST_CACHE.get("obs_mes"):\n        return\n    from urllib.parse import quote as urlquote\n\n    base = f"{site}/_api/web/lists/getbytitle(\'{lista}\')/fields"\n    status, dados = _rest_json(\n        cookies, base + "?$select=InternalName&$filter=" + urlquote("InternalName eq \'ObservacaoMes\'")\n    )\n    if status == 200 and (dados.get("d") or {}).get("results"):\n        _REST_CACHE["obs_mes"] = True\n        return\n    xml = (\n        "<Field Type=\'Note\' DisplayName=\'ObservacaoMes\' Name=\'ObservacaoMes\' "\n        "StaticName=\'ObservacaoMes\' RichText=\'FALSE\' NumLines=\'6\' />"\n    )\n    corpo = {"parameters": {"__metadata": {"type": "SP.XmlSchemaFieldCreationInformation"}, "SchemaXml": xml, "Options": 24}}\n    status, dados = _rest_json(cookies, base + "/createfieldasxml", _rest_digest(site, cookies), corpo)\n    if status not in (200, 201):\n        raise RuntimeError(f"Não criei a coluna ObservacaoMes: HTTP {status} {dados.get(\'texto\', \'\')}")\n    print("Coluna criada na lista: ObservacaoMes", flush=True)\n    _REST_CACHE["obs_mes"] = True\n\n\ndef publicar_pela_ponte(',
     '_REST_CACHE: dict[str, bool] = {}\n_OBS_MES_TITULO = "Observação Mês"\n\n\ndef _rest_garantir_obs_mes(site: str, lista: str, cookies: str) -> None:\n    """Coluna "Observação Mês" (nome interno ObservacaoMes) que fiscal ou gerente preenche pelo app."""\n    if _REST_CACHE.get("obs_mes"):\n        return\n    from urllib.parse import quote as urlquote\n\n    base = f"{site}/_api/web/lists/getbytitle(\'{lista}\')/fields"\n    status, dados = _rest_json(\n        cookies, base + "?$select=Title,InternalName&$filter=" + urlquote("InternalName eq \'ObservacaoMes\'")\n    )\n    achados = ((dados.get("d") or {}).get("results") or []) if status == 200 else []\n    if achados:\n        if achados[0].get("Title") != _OBS_MES_TITULO:\n            corpo = {"__metadata": {"type": "SP.FieldMultiLineText"}, "Title": _OBS_MES_TITULO}\n            status, dados = _rest_json(\n                cookies, base + "/getbyinternalnameortitle(\'ObservacaoMes\')",\n                _rest_digest(site, cookies), corpo, merge=True,\n            )\n            if status not in (200, 204):\n                raise RuntimeError(f"Não renomeei a coluna ObservacaoMes: HTTP {status} {dados.get(\'texto\', \'\')}")\n            print(f"Coluna renomeada na lista: {_OBS_MES_TITULO}", flush=True)\n        _REST_CACHE["obs_mes"] = True\n        return\n    # Nome interno sem acento (fica fixo); o nome que aparece na lista e no app é o com acento.\n    xml = (\n        f"<Field Type=\'Note\' DisplayName=\'{_OBS_MES_TITULO}\' Name=\'ObservacaoMes\' "\n        "StaticName=\'ObservacaoMes\' RichText=\'FALSE\' NumLines=\'6\' />"\n    )\n    corpo = {"parameters": {"__metadata": {"type": "SP.XmlSchemaFieldCreationInformation"}, "SchemaXml": xml, "Options": 24}}\n    status, dados = _rest_json(cookies, base + "/createfieldasxml", _rest_digest(site, cookies), corpo)\n    if status not in (200, 201):\n        raise RuntimeError(f"Não criei a coluna {_OBS_MES_TITULO}: HTTP {status} {dados.get(\'texto\', \'\')}")\n    print(f"Coluna criada na lista: {_OBS_MES_TITULO}", flush=True)\n    _REST_CACHE["obs_mes"] = True\n\n\ndef publicar_pela_ponte(', True),
    ('Observação Mês: coluna nova criada sozinha',
     'def publicar_pela_ponte(',
     '_REST_CACHE: dict[str, bool] = {}\n_OBS_MES_TITULO = "Observação Mês"\n\n\ndef _rest_garantir_obs_mes(site: str, lista: str, cookies: str) -> None:\n    """Coluna "Observação Mês" (nome interno ObservacaoMes) que fiscal ou gerente preenche pelo app."""\n    if _REST_CACHE.get("obs_mes"):\n        return\n    from urllib.parse import quote as urlquote\n\n    base = f"{site}/_api/web/lists/getbytitle(\'{lista}\')/fields"\n    status, dados = _rest_json(\n        cookies, base + "?$select=Title,InternalName&$filter=" + urlquote("InternalName eq \'ObservacaoMes\'")\n    )\n    achados = ((dados.get("d") or {}).get("results") or []) if status == 200 else []\n    if achados:\n        if achados[0].get("Title") != _OBS_MES_TITULO:\n            corpo = {"__metadata": {"type": "SP.FieldMultiLineText"}, "Title": _OBS_MES_TITULO}\n            status, dados = _rest_json(\n                cookies, base + "/getbyinternalnameortitle(\'ObservacaoMes\')",\n                _rest_digest(site, cookies), corpo, merge=True,\n            )\n            if status not in (200, 204):\n                raise RuntimeError(f"Não renomeei a coluna ObservacaoMes: HTTP {status} {dados.get(\'texto\', \'\')}")\n            print(f"Coluna renomeada na lista: {_OBS_MES_TITULO}", flush=True)\n        _REST_CACHE["obs_mes"] = True\n        return\n    # Nome interno sem acento (fica fixo); o nome que aparece na lista e no app é o com acento.\n    xml = (\n        f"<Field Type=\'Note\' DisplayName=\'{_OBS_MES_TITULO}\' Name=\'ObservacaoMes\' "\n        "StaticName=\'ObservacaoMes\' RichText=\'FALSE\' NumLines=\'6\' />"\n    )\n    corpo = {"parameters": {"__metadata": {"type": "SP.XmlSchemaFieldCreationInformation"}, "SchemaXml": xml, "Options": 24}}\n    status, dados = _rest_json(cookies, base + "/createfieldasxml", _rest_digest(site, cookies), corpo)\n    if status not in (200, 201):\n        raise RuntimeError(f"Não criei a coluna {_OBS_MES_TITULO}: HTTP {status} {dados.get(\'texto\', \'\')}")\n    print(f"Coluna criada na lista: {_OBS_MES_TITULO}", flush=True)\n    _REST_CACHE["obs_mes"] = True\n\n\ndef publicar_pela_ponte('),
    ('Observação Mês: Publicar garante a coluna',
     '    """Grava os contratos na lista na hora, com o mesmo login do upload do arquivo."""\n',
     '    """Grava os contratos na lista na hora, com o mesmo login do upload do arquivo."""\n    _rest_garantir_obs_mes(site, lista, cookies)\n'),
    ('Observação Mês: Puxar traz a coluna',
     '    from urllib.parse import quote as urlquote\n\n    filtro = urlquote(f"Competencia eq \'{comp}\'")\n    url = (\n        f"{site}/_api/web/lists/getbytitle(\'{lista}\')/items"\n        f"?$filter={filtro}&$top=5000&$select={select}"\n    )\n    saida: list[dict[str, Any]] = []\n    while url:\n        status, dados = _rest_json(cookies, url)',
     '    from urllib.parse import quote as urlquote\n\n    _rest_garantir_obs_mes(site, lista, cookies)\n    select += ",ObservacaoMes"\n    filtro = urlquote(f"Competencia eq \'{comp}\'")\n    url = (\n        f"{site}/_api/web/lists/getbytitle(\'{lista}\')/items"\n        f"?$filter={filtro}&$top=5000&$select={select}"\n    )\n    saida: list[dict[str, Any]] = []\n    while url:\n        status, dados = _rest_json(cookies, url)'),
    ('Observação Mês: entra na cópia de controle',
     '        "OkFiscal", "OkFiscalPor", "OkFiscalEm", "AprovacaoPor", "AprovacaoEm",\n    ]',
     '        "OkFiscal", "OkFiscalPor", "OkFiscalEm", "AprovacaoPor", "AprovacaoEm", "ObservacaoMes",\n    ]'),
]


def main() -> int:
    if len(sys.argv) >= 2:
        alvo = Path(sys.argv[1])
    else:
        # Rodado pelo botão ▷ do VS Code: procura o programa na mesma pasta deste arquivo.
        pasta = Path(__file__).resolve().parent
        alvo = pasta / "Controle_SOx_SCM42.py"
        if not alvo.is_file():
            achados = [
                p for p in pasta.glob("*.py")
                if p.name != Path(__file__).name and "def publicar_pela_ponte" in p.read_text(encoding="utf-8", errors="ignore")
            ]
            if len(achados) != 1:
                print('Não achei o programa sozinho. Use: python ajuste_direto.py "nome_do_seu_programa.py"')
                return 1
            alvo = achados[0]
        print(f"Programa: {alvo}")
    if not alvo.is_file():
        print(f"Não achei o arquivo: {alvo}")
        return 1
    texto = alvo.read_text(encoding="utf-8")
    novo = texto
    feitos = 0
    problemas = []
    for nome, antigo, troca, *opcional in AJUSTES:
        if troca in novo:
            print(f"[já estava] {nome}")
            continue
        qtd = novo.count(antigo)
        if opcional and not qtd:
            continue
        if qtd != 1:
            problemas.append(nome)
            print(f"[PROBLEMA] {nome}: trecho encontrado {qtd} vez(es), esperado 1")
            continue
        novo = novo.replace(antigo, troca, 1)
        print(f"[feito]     {nome}")
        feitos += 1
    if problemas:
        print("\nNada foi gravado, porque algum trecho não bateu. Mande esta tela para o Claude.")
        return 2
    if not feitos:
        print("\nNada a fazer: o programa já estava ajustado.")
        return 0
    try:
        compile(novo, str(alvo), "exec")
    except SyntaxError as exc:
        print(f"\nNada foi gravado: o resultado não compila ({exc}). Mande esta tela para o Claude.")
        return 3
    copia = alvo.with_suffix(alvo.suffix + ".bak")
    numero = 2
    while copia.exists():
        copia = alvo.with_suffix(alvo.suffix + f".bak{numero}")
        numero += 1
    shutil.copy2(alvo, copia)
    alvo.write_text(novo, encoding="utf-8")
    print(f"\nPronto: {feitos} ajuste(s). Cópia do original: {copia.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
