const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');
const Sp = require('./models/Sp');

const app = express();
const PORT = process.env.PORT || 3000;


// Conexión a MongoDB Atlas
const uri = "mongodb+srv://Diego:drm200318@cluster0.ys6lboo.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";
mongoose.connect(uri)
.then(() => {
  console.log("Conectado a MongoDB Atlas!");
})
.catch((error) => {
  console.error("Error al conectar con MongoDB:", error);
});

// Middlewares
app.use(cors());
app.use(bodyParser.json());

// Rutas API

// Registro de usuario
app.post('/api/register', async (req, res) => {
  let { nombre, email, password } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  email = email.trim().toLowerCase();
  const domain = email.includes('@') ? email.split('@')[1] : '';

  const role = domain === 'planeacion.com' ? 'admin' : 'user';

  try {
    const user = new User({ nombre, email, password, role });
    await user.save();
    res.status(201).json({ message: 'Usuario registrado correctamente' });
  } catch (err) {
    res.status(400).json({ error: 'Ya existe este email o error de datos' });
  }
});

// Login de usuario
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

  const valid = await user.comparePassword(password);
  if (!valid) return res.status(401).json({ error: 'Contraseña incorrecta' });

  res.json({
    message: 'Inicio de sesión exitoso',
    role: user.role,
    nombre: user.nombre 
  });
});

// Obtener todos los SPs (para llenar un select)
app.get('/api/sp', async (req, res) => {
  try {
    const sps = await Sp.find();
    res.json(sps);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener SPs' });
  }
});

// Obtener SP por Clave_Sp
app.get('/api/sp/:clave', async (req, res) => {
  const clave = req.params.clave;
  try {
    const sp = await Sp.findOne({ Clave_Sp: clave });
    if (!sp) return res.status(404).json({ error: 'SP no encontrado' });
    res.json(sp);
  } catch (error) {
    res.status(500).json({ error: 'Error al buscar SP' });
  }
});

// Guardar nuevo SP
app.post('/api/sp', async (req, res) => {
  const { Clave_Sp, Descripcion, Operaciones, Piezas_Totales, Clave_Mp, Material} = req.body;
  const ahora = new Date();
  const fechaLocal = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  try {
    const nuevoSp = new Sp({
      Clave_Sp,
      Descripcion,
      Operaciones,
      Operacion_Actual: Operaciones[0]?.Operacion || '', 
      Piezas_Totales,
      Piezas_Completadas: 0,
      Fecha: fechaLocal, // Fecha de hoy
      Clave_Mp,
      Material,
    });

    await nuevoSp.save();
    res.status(201).json(nuevoSp);
  } catch (err) {
    console.error('Error al crear el SP:', err);
    res.status(500).json({ error: 'Error al guardar SP' });
  }
});

app.put('/api/sp/piezas/:clave', async (req, res) => {
  const { clave } = req.params;
  const { piezasTotales, fecha } = req.body;

  try {
    const sp = await Sp.findOne({ Clave_Sp: clave });
    if (!sp) return res.status(404).json({ error: 'SP no encontrado' });

    sp.Piezas_Totales = piezasTotales;

    if (fecha) {
      const fechaValida = new Date(fecha);
      if (!isNaN(fechaValida)) {
        sp.Fecha = fechaValida;
      }
    }

    await sp.save();
    res.json({ message: 'SP actualizado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar SP' });
  }
});

app.get('/api/registros', async (req, res) => {
  try {
    const hoy = new Date();

    // Ajusta la zona horaria local (por ejemplo UTC-6)
    const offsetHoras = hoy.getTimezoneOffset() / 60; // Diferencia con UTC (en horas)
    const inicioDiaLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const finDiaLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);

    // Corrige las fechas a UTC para comparar con MongoDB
    const inicioDiaUTC = new Date(inicioDiaLocal.getTime() - offsetHoras * 60 * 60 * 1000);
    const finDiaUTC = new Date(finDiaLocal.getTime() - offsetHoras * 60 * 60 * 1000);

    const registros = await Sp.find({
      Piezas_Totales: { $gt: 0 },
      $expr: { $lt: ["$Piezas_Completadas", "$Piezas_Totales"] },
      Fecha: { $gte: inicioDiaUTC, $lte: finDiaUTC } // Solo hoy
    });

    const registrosAnteriores = await Sp.find({
      Piezas_Totales: { $gt: 0 },
      $expr: { $lt: ["$Piezas_Completadas", "$Piezas_Totales"] },
      Fecha: { $lt: inicioDiaUTC } // Solo días anteriores incompletos
    });

    const todosRegistros = [...registrosAnteriores, ...registros];

      const tablaFormateada = todosRegistros.flatMap(sp => {
      const operacionActual = sp.Operacion_Actual || (sp.Operaciones[0]?.Operacion || '');

      return sp.Operaciones.map(op => ({
        Clave_Sp: sp.Clave_Sp,
        Descripcion: sp.Descripcion,
        Clave_Mp: sp.Clave_Mp,  
        Material: sp.Material, 
        Operacion: op.Operacion,
        Nombre_Maquina: op.Nombre_Maquina,
        Clave_Maquina: op.Clave_Maquina,
        Tiempo_Maquina: op.Tiempo_Maquina,
        Operacion_Actual: operacionActual,
        Fecha: sp.Fecha ? sp.Fecha.toISOString().split('T')[0] : '',
        Piezas_Totales: sp.Piezas_Totales,
        Piezas_Completadas: sp.Piezas_Completadas,
        Piezas_Faltantes: sp.Piezas_Totales - sp.Piezas_Completadas,
        Progreso: typeof calcularProgreso(sp.Piezas_Totales, sp.Piezas_Completadas) === 'number'
          ? calcularProgreso(sp.Piezas_Totales, sp.Piezas_Completadas)
          : parseFloat(calcularProgreso(sp.Piezas_Totales, sp.Piezas_Completadas)) || 0
      }));
    });

    res.json(tablaFormateada);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener registros' });
  }
});

function calcularProgreso(totales, completadas) {
  if (!totales || totales === 0) return 0;
  return Math.floor((completadas / totales) * 100);
}

app.put('/api/sp/:clave', async (req, res) => {
  const { clave } = req.params;
  const {
    operacionIndex,
    nombre_maquina,
    clave_maquina,
    tiempo_maquina,
    piezas_totales,
    descripcion,
    clave_mp,
    material,
    fecha,
    nueva_clave_sp  // ← Nuevo campo recibido
  } = req.body;

  try {
    const sp = await Sp.findOne({ Clave_Sp: clave });
    if (!sp) return res.status(404).json({ error: 'SP no encontrado' });

    // Actualizar operación específica
    sp.Operaciones[operacionIndex].Nombre_Maquina = nombre_maquina;
    sp.Operaciones[operacionIndex].Clave_Maquina = clave_maquina;
    sp.Operaciones[operacionIndex].Tiempo_Maquina = tiempo_maquina;

    // Actualizar campos generales
    sp.Piezas_Totales = piezas_totales;
    sp.Descripcion = descripcion;

    // Actualizar Clave_MP y Material correctamente
    if (typeof clave_mp !== 'undefined') sp.Clave_Mp = clave_mp;
    if (typeof material !== 'undefined') sp.Material = material;

    // Actualizar Fecha si se envió
    if (fecha) {
      sp.Fecha = new Date(fecha);
    }

    // ✅ Actualizar Clave SP si se envió y es diferente
    if (nueva_clave_sp && nueva_clave_sp !== clave) {
      const spExistente = await Sp.findOne({ Clave_Sp: nueva_clave_sp });
      if (spExistente) {
        return res.status(400).json({ error: 'Ya existe un SP con esa clave' });
      }
      sp.Clave_Sp = nueva_clave_sp;
    }

    await sp.save();
    res.json({ message: 'SP actualizado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar SP' });
  }
});

// Actualiza piezas completadas de un SP
app.put('/api/registros/:clave/completadas', async (req, res) => {
  const { clave } = req.params;
  const { piezasCompletadas } = req.body;

  try {
    const sp = await Sp.findOne({ Clave_Sp: clave });
    if (!sp) {
      return res.status(404).json({ error: 'SP no encontrado' });
    }

    // Actualiza piezas completadas
    sp.Piezas_Completadas = piezasCompletadas;
    await sp.save();

    const piezasFaltantes = sp.Piezas_Totales - piezasCompletadas;
    const progreso = calcularProgreso(sp.Piezas_Totales, piezasCompletadas);

    let pasoAvanzado = null;
    let nuevaOperacionActual = null;

    // Si se completa al 100%, pasar al siguiente paso
      if (progreso >= 100) {
      const operaciones = sp.Operaciones || [];
      const operacionActual = sp.Operacion_Actual;

      const idxActual = operaciones.findIndex(op =>
        op.Operacion.trim().toLowerCase() === operacionActual.trim().toLowerCase()
      );

      if (idxActual === -1) {
        console.warn(`No se encontró la operación actual "${operacionActual}" en el SP ${clave}`);
        return res.status(400).json({ error: 'Operación actual no válida' });
      }

      const siguientePaso = operaciones[idxActual + 1];

      if (siguientePaso) {
        // 👇 Copiar el valor de piezasCompletadas como nuevas piezasTotales
        sp.Piezas_Totales = piezasCompletadas; // ✅ Este valor se usará en la siguiente operación
        sp.Piezas_Completadas = 0;             // Reinicia para la nueva operación
        sp.Operacion_Actual = siguientePaso.Operacion;
        
        await sp.save(); // Guarda todo junto

        pasoAvanzado = {
          Nombre_Maquina: siguientePaso.Nombre_Maquina,
          Clave_Maquina: siguientePaso.Clave_Maquina,
          Tiempo_Maquina: siguientePaso.Tiempo_Maquina
        };

        nuevaOperacionActual = siguientePaso.Operacion;
      }
    }


    res.json({
      message: 'Actualizado correctamente',
      piezasFaltantes,
      progreso,
      pasoAvanzado,
      nuevaOperacionActual
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar progreso' });
  }
});

app.get('/api/sp-validos', async (req, res) => {
  try {
    // Traemos SPs que tengan piezas totales > 0 (o el criterio para "agregados")
    // Incluye SPs con cualquier fecha, sea pasada, hoy o futura
    const spValidos = await Sp.find({
      Piezas_Totales: { $gt: 0 }
      // No filtro por fecha
    }).select('Clave_Sp -_id'); // Solo clave

    const claves = spValidos.map(sp => sp.Clave_Sp);

    res.json(claves);
  } catch (error) {
    console.error('Error al obtener SP válidos:', error);
    res.status(500).json({ error: 'Error al obtener SP válidos' });
  }
});

// Servir archivos estáticos (React u otros)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
