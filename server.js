const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');
const Sp = require('./models/Sp');
const multer = require('multer');
const xlsx = require('xlsx');
const upload = multer({ dest: 'uploads/' });


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
  const { Clave_Sp, Descripcion, Operaciones, Piezas_Totales, Clave_Mp, Material } = req.body;
  const ahora = new Date();
  const fechaLocal = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  try {
    let sp = await Sp.findOne({ Clave_Sp });

    if (sp) {
      if (sp.Oculto) {
        // Reactivar y resetear datos
        sp.Oculto = false;
        sp.Descripcion = Descripcion;
        sp.Operaciones = Operaciones;
        sp.Operacion_Actual = Operaciones[0]?.Operacion || '';
        sp.Piezas_Totales = Piezas_Totales;
        sp.Piezas_Completadas = 0;
        sp.Fecha = fechaLocal;
        sp.Clave_Mp = Clave_Mp;
        sp.Material = Material;

        await sp.save();
        return res.status(200).json({ message: 'SP reactivado y actualizado', sp });
      } else {
        return res.status(400).json({ error: 'SP con esa clave ya existe' });
      }
    } else {
      // Crear nuevo SP
      const nuevoSp = new Sp({
        Clave_Sp,
        Descripcion,
        Operaciones,
        Operacion_Actual: Operaciones[0]?.Operacion || '',
        Piezas_Totales,
        Piezas_Completadas: 0,
        Fecha: fechaLocal,
        Clave_Mp,
        Material,
      });

      await nuevoSp.save();
      return res.status(201).json({ message: 'SP creado', sp: nuevoSp });
    }
  } catch (err) {
    console.error('Error al crear o reactivar el SP:', err);
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
    sp.Oculto = false;  // Reactivar el SP

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
    const registros = await Sp.find({
      Oculto: { $ne: true },
      Piezas_Totales: { $gt: 0 },
      $expr: { $lt: ["$Piezas_Completadas", "$Piezas_Totales"] }
    });

    const tablaFormateada = registros.flatMap(sp => {
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
        Piezas_Completadas: sp.Piezas_Completadas ?? 0, // <-- Aquí garantizamos que no sea null ni undefined
        Piezas_Faltantes: sp.Piezas_Totales - (sp.Piezas_Completadas ?? 0),
        Progreso: typeof calcularProgreso(sp.Piezas_Totales, sp.Piezas_Completadas) === 'number'
          ? calcularProgreso(sp.Piezas_Totales, sp.Piezas_Completadas)
          : 0
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
  return Math.floor(((completadas ?? 0) / totales) * 100);
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
    nueva_clave_sp
  } = req.body;

  try {
    const sp = await Sp.findOne({ Clave_Sp: clave });
    if (!sp) return res.status(404).json({ error: 'SP no encontrado' });

    // Actualizar operación específica
    if (typeof operacionIndex === 'number' && sp.Operaciones[operacionIndex]) {
      sp.Operaciones[operacionIndex].Nombre_Maquina = nombre_maquina;
      sp.Operaciones[operacionIndex].Clave_Maquina = clave_maquina;
      sp.Operaciones[operacionIndex].Tiempo_Maquina = tiempo_maquina;
    }

    // Actualizar campos generales
    sp.Piezas_Totales = piezas_totales;
    sp.Descripcion = descripcion;

    if (typeof clave_mp !== 'undefined') sp.Clave_Mp = clave_mp;
    if (typeof material !== 'undefined') sp.Material = material;

    if (fecha) {
      sp.Fecha = new Date(fecha);
    }

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
    // Actualiza piezas completadas (asegurar no undefined)
    sp.Piezas_Completadas = piezasCompletadas ?? 0;
    await sp.save();

    const piezasFaltantes = sp.Piezas_Totales - sp.Piezas_Completadas;
    const progreso = calcularProgreso(sp.Piezas_Totales, sp.Piezas_Completadas);

    let pasoAvanzado = null;
    let nuevaOperacionActual = null;

    // Si se completa al 100%, pasar al siguiente paso
    if (progreso >= 100) {
      const operaciones = sp.Operaciones || [];
      const operacionActual = sp.Operacion_Actual;

      const idxActual = operaciones.findIndex(op =>
        op.Operacion.trim().toLowerCase() === (operacionActual?.trim().toLowerCase() || '')
      );

      if (idxActual === -1) {
        console.warn(`No se encontró la operación actual "${operacionActual}" en el SP ${clave}`);
        return res.status(400).json({ error: 'Operación actual no válida' });
      }

      const siguientePaso = operaciones[idxActual + 1];

      if (siguientePaso) {
        sp.Piezas_Totales = piezasCompletadas; // Nuevas piezas totales para siguiente paso
        sp.Piezas_Completadas = 0;             // Reiniciar piezas completadas
        sp.Operacion_Actual = siguientePaso.Operacion;

        await sp.save();

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
    const spValidos = await Sp.find({
      Piezas_Totales: { $gt: 0 }
    }).select('Clave_Sp -_id');

    const claves = spValidos.map(sp => sp.Clave_Sp);

    res.json(claves);
  } catch (error) {
    console.error('Error al obtener SP válidos:', error);
    res.status(500).json({ error: 'Error al obtener SP válidos' });
  }
});

// Ocultar SP y reiniciar valores
app.post('/api/sp/:clave/ocultar', async (req, res) => {
  const clave = req.params.clave;

  try {
    const sp = await Sp.findOne({ Clave_Sp: clave });

    if (!sp) {
      return res.status(404).json({ error: 'SP no encontrado' });
    }

    sp.Piezas_Completadas = 0;
    sp.Operacion_Actual = sp.Operaciones[0]?.Operacion || '';
    sp.Fecha = null;
    sp.Oculto = true;

    await sp.save();

    res.status(200).json({ mensaje: 'SP ocultado y reiniciado con éxito' });
  } catch (error) {
    console.error('Error ocultando SP:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Subir Excel y agregar SPs a la base de datos
app.post('/api/subir-excel', upload.single('archivo'), async (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const hoja = workbook.Sheets[workbook.SheetNames[0]];
    const datos = xlsx.utils.sheet_to_json(hoja);

    for (const fila of datos) {
      const { Clave_Sp, Descripcion, Operacion, Nombre_Maquina, Clave_Maquina, Tiempo_Maquina, Piezas_Totales, Clave_Mp, Material } = fila;

      let sp = await Sp.findOne({ Clave_Sp });

      if (!sp) {
        // Si no existe, crearlo
        sp = new Sp({
          Clave_Sp,
          Descripcion,
          Operaciones: [{
            Operacion,
            Nombre_Maquina,
            Clave_Maquina,
            Tiempo_Maquina
          }],
          Operacion_Actual: Operacion,
          Piezas_Totales,
          Piezas_Completadas: 0,
          Clave_Mp,
          Material
        });
      } else {
        // Si existe, agregar operación
        sp.Operaciones.push({
          Operacion,
          Nombre_Maquina,
          Clave_Maquina,
          Tiempo_Maquina
        });
      }

      await sp.save();
    }

    res.json({ message: 'Datos importados correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al procesar el archivo' });
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