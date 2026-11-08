# Aísla una sola bala de grabaciones de ráfagas: busca dónde empieza cada disparo (subidas bruscas del
# volumen) y corta desde el primero hasta el siguiente, con cierre suave. Deja los resultados como un
# evento más en la página de candidatos (/tools/labs/sonidos.html).
#
#   python tools/audio/aislar-disparo.py mg7-disparo [enemigo-fusil:163457:0.8]
#
# El primer argumento es el evento cuyos candidatos se aíslan; los demás, `evento:id:tono` de
# grabaciones que se agregan tal cual con otro tono (por ejemplo, el fusil más grave).
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
CANDIDATOS = RAIZ / 'tools/labs/sonidos/candidatos'
TASA = 44100
MAX_COLA = 0.45  # segundos: a 7 disparos por segundo, más cola se encima


def leer(archivo, tono=1.0):
    filtro = ['-af', f'asetrate={int(TASA * tono)},aresample={TASA}'] if tono != 1 else []
    datos = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(archivo), *filtro, '-ac', '1', '-ar', str(TASA), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(datos, dtype=np.float32).copy()


def escribir(senal, destino):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(TASA), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '128k', str(destino)], input=np.clip(senal, -1, 1).astype(np.float32).tobytes(), check=True)


def disparos(x):
    """Dónde empieza cada disparo: el volumen (ventanas de 5 ms) salta 12 dB o más sobre lo de antes."""
    ventana = int(0.005 * TASA)
    n = len(x) // ventana
    db = 20 * np.log10(np.sqrt(np.mean(x[:n * ventana].reshape(n, ventana) ** 2, axis=1)) + 1e-7)
    tope = db.max()
    # Si la grabación arranca en el disparo, sin silencio antes, ese es el primero.
    primero = int(np.argmax(db > tope - 20))
    inicios = [primero] if primero < 4 else []
    for i in range(4, n):
        antes = db[max(0, i - 8):i - 1].mean()
        if db[i] > tope - 20 and db[i] - antes > 12 and (not inicios or i - inicios[-1] > 10):
            inicios.append(i)
    return [i * ventana for i in inicios]


def aislar(x):
    inicios = disparos(x)
    if not inicios:
        return None, 0
    desde = max(0, inicios[0] - int(0.003 * TASA))
    hasta = min(len(x), inicios[1] - int(0.002 * TASA) if len(inicios) > 1 else len(x), desde + int(MAX_COLA * TASA))
    y = x[desde:hasta].copy()
    cierre = min(len(y), int(0.04 * TASA))
    y[-cierre:] *= np.linspace(1, 0, cierre) ** 2
    return y * (10 ** (-1 / 20) / max(np.abs(y).max(), 1e-9)), len(inicios)


def main():
    evento, extras = sys.argv[1], sys.argv[2:]
    indice = json.loads((CANDIDATOS / 'indice.json').read_text(encoding='utf8'))
    nuevo = f'{evento}-aislado'
    (CANDIDATOS / nuevo).mkdir(exist_ok=True)
    lista = []
    for c in indice[evento]['candidatos']:
        y, total = aislar(leer(CANDIDATOS / c['archivo']))
        if y is None:
            print(f'- {c["id"]}: no encontré disparos')
            continue
        escribir(y, CANDIDATOS / nuevo / f'{c["id"]}.mp3')
        lista.append({**c, 'archivo': f'{nuevo}/{c["id"]}.mp3', 'duracion': round(len(y) / TASA, 2), 'nombre': f'{c["nombre"]} · 1 de {total} disparos'})
        print(f'✓ {c["id"]}: {total} disparos, me quedo con el primero ({len(y) / TASA:.2f} s)')
    for extra in extras:
        origen, ident, tono = extra.split(':')
        c = next(x for x in indice[origen]['candidatos'] if str(x['id']) == ident)
        y, _ = aislar(leer(CANDIDATOS / c['archivo'], float(tono)))
        escribir(y, CANDIDATOS / nuevo / f'{ident}.mp3')
        lista.append({**c, 'archivo': f'{nuevo}/{ident}.mp3', 'duracion': round(len(y) / TASA, 2), 'nombre': f'{c["nombre"]} · más grave (tono {tono})'})
        print(f'✓ {ident}: {c["nombre"]} con tono {tono}')
    indice[nuevo] = {'nombre': f'{indice[evento]["nombre"]}: una sola bala, aislada de cada grabación', 'bucle': False, 'candidatos': lista}
    (CANDIDATOS / 'indice.json').write_text(json.dumps(indice, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


main()
