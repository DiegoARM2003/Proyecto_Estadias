// migrate.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });  // si usas .env
const Sp = require('./models/Sp');

// 🔥 Aquí pones tu misma URI que usas en app.js
const uri = "mongodb+srv://Diego:drm200318@cluster0.ys6lboo.mongodb.net/myFirstDatabase?retryWrites=true&w=majority";

async function runMigration() {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✨ Conectado a MongoDB para migración');

    // Agregar Clave_Mp y Material vacíos a todos los documentos que no los tengan
    const result = await Sp.updateMany(
      { $or: [ { Clave_Mp: { $exists: false } }, { Material: { $exists: false } } ] },
      { $set: { Clave_Mp: '', Material: '' } }
    );

    console.log(`✅ Migración completada. Documentos modificados: ${result.nModified}`);
  } catch (err) {
    console.error('❌ Error en la migración:', err);
  } finally {
    mongoose.disconnect();
  }
}

runMigration();
