// Metadatos de cada modelo que el juego dibuja (docs/asset-standard.md): pivotes, bocas y
// medidas en coordenadas del modelo, con el chasis de largo 1. Los escribe npm run
// assets:normalize y check:rigs comprueba que coinciden con el modelo. El núcleo los usa para
// saber de dónde sale cada bala; render dibuja el mismo modelo. Los modelos de prueba que no se
// publican (assets/test-models/, como el M163) tienen su rig, pero no entran aquí.
import apc8x8 from './apc-8x8.json' with { type: 'json' };
import motoRecon from './moto-recon.json' with { type: 'json' };
import motoReconN1 from './moto-recon-n1.json' with { type: 'json' };
import motoReconN2 from './moto-recon-n2.json' with { type: 'json' };
import motoReconN3 from './moto-recon-n3.json' with { type: 'json' };
import camionTropas from './camion-tropas.json' with { type: 'json' };
import camionTropasDestruido from './camion-tropas-destruido.json' with { type: 'json' };
import lm2LanzaN1 from './lm2-lanza-n1.json' with { type: 'json' };
import lm2LanzaN2 from './lm2-lanza-n2.json' with { type: 'json' };
import lm2LanzaN3 from './lm2-lanza-n3.json' with { type: 'json' };
import lm2LanzaN4 from './lm2-lanza-n4.json' with { type: 'json' };
import lm2LanzaN5 from './lm2-lanza-n5.json' with { type: 'json' };
import tankHeavy from './tank-heavy.json' with { type: 'json' };
import mg7N1 from './mg7-n1.json' with { type: 'json' };
import mg7N2 from './mg7-n2.json' with { type: 'json' };
import mg7N3 from './mg7-n3.json' with { type: 'json' };
import mg7N4 from './mg7-n4.json' with { type: 'json' };
import mg7N5 from './mg7-n5.json' with { type: 'json' };
import mg7Destruida from './mg7-destruida.json' with { type: 'json' };
import lm2LanzaDestruida from './lm2-lanza-destruida.json' with { type: 'json' };
import infanteriaAmetralladora from './infanteria-ametralladora.json' with { type: 'json' };
import infanteriaRpg from './infanteria-rpg.json' with { type: 'json' };
import motoReconDestruida from './moto-recon-destruida.json' with { type: 'json' };
import dronFpv from './dron-fpv.json' with { type: 'json' };
import dronAla from './dron-ala.json' with { type: 'json' };
import aa3HalconN1 from './aa3-halcon-n1.json' with { type: 'json' };
import aa3HalconN2 from './aa3-halcon-n2.json' with { type: 'json' };
import aa3HalconN3 from './aa3-halcon-n3.json' with { type: 'json' };
import aa3HalconN4 from './aa3-halcon-n4.json' with { type: 'json' };
import aa3HalconN5 from './aa3-halcon-n5.json' with { type: 'json' };
import patrulla from './patrulla.json' with { type: 'json' };
import patrullaAmetralladora from './patrulla-ametralladora.json' with { type: 'json' };
import patrullaMisil from './patrulla-misil.json' with { type: 'json' };
import patrullaMisiles from './patrulla-misiles.json' with { type: 'json' };
import aa3HalconDestruida from './aa3-halcon-destruida.json' with { type: 'json' };
import rk40BrasaDestruida from './rk40-brasa-destruida.json' with { type: 'json' };
import rk40BrasaN4 from './rk40-brasa-n4.json' with { type: 'json' };
import rk40BrasaN1 from './rk40-brasa-n1.json' with { type: 'json' };
import rk40BrasaN2 from './rk40-brasa-n2.json' with { type: 'json' };
import rk40BrasaN3 from './rk40-brasa-n3.json' with { type: 'json' };
import rk40BrasaN5 from './rk40-brasa-n5.json' with { type: 'json' };
import blindajeN1 from './blindaje-n1.json' with { type: 'json' };
import blindajeN2 from './blindaje-n2.json' with { type: 'json' };

export const rigDefinitions = Object.fromEntries(
  [rk40BrasaN5, rk40BrasaN3, rk40BrasaN2, rk40BrasaN1, rk40BrasaN4, rk40BrasaDestruida, aa3HalconDestruida, aa3HalconN3, aa3HalconN4, aa3HalconN5, aa3HalconN2, aa3HalconN1, dronAla, dronFpv, motoRecon, motoReconN1, motoReconN2, motoReconN3, camionTropas, camionTropasDestruido, apc8x8, patrullaMisil, patrullaMisiles, patrulla, patrullaAmetralladora, lm2LanzaN1, lm2LanzaN2, lm2LanzaN3, lm2LanzaN4, lm2LanzaN5, tankHeavy, mg7N1, mg7N2, mg7N3, mg7N4, mg7N5, mg7Destruida, lm2LanzaDestruida, blindajeN1, blindajeN2, infanteriaAmetralladora, infanteriaRpg, motoReconDestruida].map((rig) => [rig.id, rig]),
);
