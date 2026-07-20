#!/bin/bash
# Mydin — atalho de duplo clique para Mac.
# Primeira execução: cria um ambiente Python isolado e instala as dependências.
# Depois: só sobe o servidor e abre o navegador.

cd "$(dirname "$0")" || exit 1

echo "═══════════════════════════════════════════"
echo "  Mydin — gestão financeira local"
echo "═══════════════════════════════════════════"
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ Python 3 não encontrado."
  echo "   Instale em https://www.python.org/downloads/ e rode este atalho de novo."
  read -r -p "Pressione Enter para fechar..."
  exit 1
fi

# Ambiente isolado dentro da pasta (não mexe no Python do sistema)
if [ ! -d ".venv" ]; then
  echo "Primeira execução: preparando ambiente (só demora desta vez)..."
  python3 -m venv .venv || { echo "❌ Falha ao criar o ambiente."; read -r -p "Enter para fechar..."; exit 1; }
fi
source .venv/bin/activate

# Instala/atualiza dependências se necessário
if ! python -c "import flask, openpyxl, fpdf" >/dev/null 2>&1; then
  echo "Instalando dependências..."
  pip install --quiet --upgrade pip
  pip install --quiet -r requirements.txt || { echo "❌ Falha ao instalar dependências."; read -r -p "Enter para fechar..."; exit 1; }
fi

PORTA=5000
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

echo
echo "✅ Mydin rodando!"
echo
echo "   Neste computador:  http://127.0.0.1:$PORTA"
if [ -n "$IP" ]; then
  echo "   No celular (mesmo Wi-Fi):  http://$IP:$PORTA"
fi
echo
echo "   Para parar: feche esta janela (ou Ctrl+C)."
echo

# Abre o navegador assim que o servidor responder
( for _ in $(seq 1 30); do
    sleep 0.5
    curl -s -o /dev/null "http://127.0.0.1:$PORTA" && { open "http://127.0.0.1:$PORTA"; break; }
  done ) &

exec python run.py --host 0.0.0.0 --port "$PORTA"
