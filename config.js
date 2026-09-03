// ⚙️ Configuración del repositorio que hace de "servidor".
// Los gastos se guardan en el archivo data.json de este mismo repo,
// usando la API de GitHub. No hace falta ningún otro servicio.

export const GITHUB = {
  owner: "FrancoAgnic",   // dueño del repo
  repo: "split-super",    // nombre del repo
  branch: "main",         // rama donde se guardan los datos
  dataPath: "data.json",  // archivo que hace de base de datos
};
