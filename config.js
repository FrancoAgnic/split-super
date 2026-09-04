// ⚙️ Configuración.
// Los datos se guardan en jsonblob.com: un almacén JSON gratis y SIN login.
// Cada "grupo" es un blob con un id. Ese id viaja en el link que compartís.
// No hay tokens ni permisos: quien tiene el link, ve y edita.

export const CONFIG = {
  api: "https://jsonblob.com/api/jsonBlob",
  groupParam: "g",   // el link comparte el grupo así: ...#g=<id>
};
