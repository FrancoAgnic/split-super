// ⚙️ Configuración.
// Los datos se guardan en un almacén JSON gratis y SIN login.
// Cada "grupo" es un bin con un id, y ese id viaja en el link que compartís.
// No hay tokens ni permisos: quien tiene el link, ve y edita.

export const CONFIG = {
  api: "https://json.extendsclass.com/bin",
  groupParam: "g",   // el link comparte el grupo así: ...#g=<id>
};
