# Procesa los sonidos elegidos para el juego (tools/audio/sonidos.json) y los deja en assets/audio/sfx/
# como MP3 mono livianos. Disparos: sin el silencio del comienzo, recortados con cierre suave y con el
# pico a -1 dB. Bucles: el tramo más parejo de la grabación, cerrado con un fundido cruzado para que no
# salte, al mismo volumen medio. Necesita ffmpeg y numpy.
#
#   python tools/audio/procesar.py            todos los que tengan grabación elegida
#   python tools/audio/procesar.py fuego      solo esos
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[2]
CANDIDATOS = RAIZ / 'tools/labs/sonidos/candidatos'
SALIDA = RAIZ / 'assets/audio/sfx'
TASA = 44100
PICO = 10 ** (-1 / 20)
RMS_BUCLE = 10 ** (-20 / 20)
CRUCE = 0.25  # segundos del fundido cruzado de un bucle


def leer(archivo, tono=1.0):
    """Decodifica a mono float; `tono` acelera (y sube) el sonido."""
    filtro = ['-af', f'asetrate={int(TASA * tono)},aresample={TASA}'] if tono != 1 else []
    datos = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(archivo), *filtro, '-ac', '1', '-ar', str(TASA), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(datos, dtype=np.float32).copy()


def escribir(senal, destino, kbps):
    senal = np.clip(senal, -1, 1).astype(np.float32)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(TASA), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', str(destino)], input=senal.tobytes(), check=True)


def disparo(x, maximo):
    # Desde donde la señal pasa -40 dB de su pico, con 5 ms de margen.
    umbral = np.abs(x).max() * 10 ** (-40 / 20)
    inicio = max(0, int(np.argmax(np.abs(x) > umbral)) - int(0.005 * TASA))
    x = x[inicio:inicio + int(maximo * TASA)]
    cierre = min(len(x), int(0.08 * TASA))
    x[-cierre:] *= np.linspace(1, 0, cierre) ** 2
    return x * (PICO / max(np.abs(x).max(), 1e-9))


def bucle(x, largo):
    largo = min(int(largo * TASA), len(x) - int(CRUCE * TASA) - 1)
    cruce = int(CRUCE * TASA)
    tramo = largo + cruce
    # El tramo más parejo: la menor variación del volumen en ventanas de 50 ms, lejos de los bordes.
    ventana = int(0.05 * TASA)
    energia = 20 * np.log10(np.sqrt(np.convolve(x ** 2, np.ones(ventana) / ventana, 'same')) + 1e-6)
    margen = int(0.1 * len(x))
    desde, hasta = margen, max(margen + 1, len(x) - margen - tramo)
    if hasta <= desde:
        desde, hasta = 0, max(1, len(x) - tramo)
    paso = int(0.05 * TASA)
    mejor = min(range(desde, hasta, paso), key=lambda i: np.std(energia[i:i + tramo]))
    a = x[mejor:mejor + tramo]
    y = a[cruce:cruce + largo].copy()
    t = np.linspace(0, np.pi / 2, cruce)
    y[largo - cruce:] = a[largo:largo + cruce] * np.cos(t) + a[:cruce] * np.sin(t)
    y *= RMS_BUCLE / max(np.sqrt(np.mean(y ** 2)), 1e-9)
    return y * min(1, PICO / max(np.abs(y).max(), 1e-9))


def eco(x):
    """Una bala sacada de una ráfaga no tiene cola: tres rebotes cortos y apagados le dan cuerpo."""
    salida = np.concatenate([x, np.zeros(int(0.25 * TASA), dtype=np.float32)])
    for retardo, nivel in ((0.035, 0.38), (0.085, 0.22), (0.15, 0.1)):
        inicio = int(retardo * TASA)
        # Más apagado en cada rebote: un promedio móvil hace de filtro de graves.
        suave = np.convolve(x, np.ones(12) / 12, 'same') * nivel
        salida[inicio:inicio + len(x)] += suave
    cierre = int(0.12 * TASA)
    salida[-cierre:] *= np.linspace(1, 0, cierre) ** 2
    return salida * (PICO / max(np.abs(salida).max(), 1e-9))


def main():
    sonidos = json.loads((RAIZ / 'tools/audio/sonidos.json').read_text(encoding='utf8'))['sonidos']
    seleccion = json.loads((RAIZ / 'tools/audio/seleccion.json').read_text(encoding='utf8'))
    solo = sys.argv[1:]
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nombre, cfg in sonidos.items():
        if solo and nombre not in solo:
            continue
        elegido = seleccion.get(cfg['evento'])
        if not isinstance(elegido, int):
            print(f'- {nombre}: sin grabación elegida')
            continue
        x = leer(CANDIDATOS / cfg['evento'] / f'{elegido}.mp3', cfg.get('tono', 1.0))
        y = bucle(x, cfg['bucle']) if 'bucle' in cfg else disparo(x, cfg['max'])
        if cfg.get('eco'):
            y = eco(y)
        destino = SALIDA / f'{nombre}.mp3'
        escribir(y, destino, 112 if 'bucle' in cfg else 96)
        print(f'✓ {nombre}: {len(y) / TASA:.2f} s, {destino.stat().st_size // 1024} KB  ←  {elegido}')


main()
