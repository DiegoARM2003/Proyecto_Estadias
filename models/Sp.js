const mongoose = require('mongoose');

const OperacionSchema = new mongoose.Schema({
  Operacion: String,
  Nombre_Maquina: String,
  Clave_Maquina: String,
  Tiempo_Maquina: String,
  Piezas_Completadas: { type: Number, default: 0 }
});

const SpSchema = new mongoose.Schema({
  Clave_Sp: { type: String, required: true },
  Descripcion: String,
  Fecha: { type: Date, default: Date.now },
  Piezas_Totales: Number,
  Piezas_Completadas: Number,
  Piezas_Faltantes: Number,
  Operaciones: [OperacionSchema],
  Operacion_Actual: String,
  Clave_Mp: { type: String, default: '' },
  Material:   { type: String, default: '' },
  Oculto: { type: Boolean, default: false}
});

module.exports = mongoose.model('Sp', SpSchema);
