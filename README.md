# 🛒 Split Súper

App para dividir los gastos del supermercado entre varias personas **según lo que compró cada una**, no en partes iguales.

Ideal para cuando conviven varias personas, hacen las compras juntas y **pagan todo con una sola tarjeta**, pero cada uno quiere saber cuánto gastó realmente y cuánto le debe a quien puso la tarjeta.

- ✅ Cada uno carga sus propios gastos (leche, shampoo, lo que sea).
- ✅ Se ve el total de cada persona y el total del mes.
- ✅ Se elige quién pagó con la tarjeta y la app calcula **cuánto le debe cada uno**.
- ✅ **Compartido entre todos**: los datos se guardan en GitHub y todos ven lo mismo.
- ✅ Se organiza por **mes**.
- ✅ Web pura (HTML/CSS/JS) + **GitHub como servidor**. Sin Firebase ni otros servicios.

## 🧠 ¿Cómo guarda los datos? (sin Firebase)

Los gastos se guardan en el archivo **`data.json`** de este mismo repositorio. La app lo lee y lo escribe usando la **API de GitHub**. O sea: **GitHub hace de servidor/base de datos.**

- **Leer** es público y gratis: cualquiera puede abrir la app y ver los gastos.
- **Escribir** (guardar/borrar un gasto) necesita una **llave de acceso** (un token de GitHub). Esto es obligatorio: GitHub nunca deja escribir sin autenticación (si no, cualquiera en internet podría cargar gastos falsos).

La llave se guarda **solo en el navegador de cada persona** (nunca se sube al repo).

---

## 🚀 Puesta en marcha

### 1. Publicar la app (GitHub Pages)

1. En este repo: **Settings → Pages**.
2. **Source**: *Deploy from a branch*. Branch: **`main`**, carpeta **`/ (root)`** → **Save**.
3. En ~1 minuto la app queda en: `https://francoagnic.github.io/split-super/`

### 2. Crear la llave de acceso (una sola vez)

Una persona (por ej. el dueño del repo) crea **una llave** y se la comparte a los demás por privado (WhatsApp, etc.).

1. Entrá a <https://github.com/settings/personal-access-tokens/new> (Fine-grained token).
2. **Token name**: `split-super`. **Expiration**: lo que quieras (ej: 90 días o *No expiration*).
3. **Repository access** → *Only select repositories* → elegí **`split-super`**.
4. **Permissions** → *Repository permissions* → **Contents**: poné **Read and write**.
5. **Generate token** y **copiá** la llave (empieza con `github_pat_...`). ⚠️ Se muestra una sola vez.

> Esa misma llave la usan los 4. Como solo puede escribir en el repo `split-super`, el riesgo es mínimo; si se pierde, la revocás y creás otra.

### 3. Conectarte vos (el dueño de la llave)

1. Abrí la app y tocá **🔑 Conectar**.
2. Pegá la llave y tocá **Guardar llave**.
3. Listo: ya podés cargar gastos.

### 4. Sumar a los demás **sin que configuren nada** (link mágico)

Después de conectarte, en el mismo cuadro **🔑 Cuenta** aparece un bloque **"Sumar a los demás"** con un **link para compartir**.

1. Tocá **Copiar** y mandáselo a tus compañeros por privado (WhatsApp).
2. Ellos solo tienen que **abrir el link una vez**: la app se conecta sola (la llave viaja dentro del link y queda guardada en su celular). **No configuran nada, no tocan el repo, no pegan nada.**
3. Cada uno hace "Agregar a pantalla de inicio" y ya lo usan como una app normal.

> ⚠️ Compartí ese link **solo con tus compañeros**, no lo publiques: la llave va adentro.
> Si alguna vez se filtra, revocás la llave en GitHub y generás otra (y mandás un link nuevo).

> 💡 Sin llave, la app funciona igual pero en **modo lectura** (solo ver).

---

## 🧑‍🤝‍🧑 Cómo se usa

1. Elegí el **mes** arriba.
2. En **Agregar gasto**: elegí de quién es, la descripción y el monto → **Agregar**.
3. En **Resumen del mes** ves cuánto lleva gastado cada uno y el total.
4. Elegí en **"Pagó con la tarjeta"** quién puso la tarjeta ese mes: la app muestra cuánto le debe cada uno.
5. Tocá **"Editar nombres"** para poner los nombres reales.

Los datos se refrescan solos cada pocos segundos, así que todos ven los cambios de todos.

---

## ⚙️ Configuración

El repo que hace de servidor se define en [`config.js`](./config.js):

```js
export const GITHUB = {
  owner: "FrancoAgnic",
  repo: "split-super",
  branch: "main",
  dataPath: "data.json",
};
```

## 🧩 Estructura del proyecto

```
index.html   Estructura de la página
styles.css   Estilos (tema oscuro, responsive)
app.js       Lógica + lectura/escritura contra la API de GitHub
config.js    A qué repo apuntar
data.json    La "base de datos" (se actualiza sola desde la app)
```

## 🗂️ Formato de `data.json`

```json
{
  "people": ["Ana", "Beto", "Caro", "Dani"],
  "expenses": [
    { "id": "abc123", "month": "2026-09", "person": "Ana", "description": "Leche", "amount": 950, "ts": 1725400000000 }
  ],
  "months": {
    "2026-09": { "paidBy": "Ana" }
  }
}
```

---

## ❓ Preguntas frecuentes

**¿Y si dos cargan un gasto al mismo tiempo?** La app relee lo último antes de guardar y reintenta automáticamente, así no se pisan los datos.

**¿La llave es peligrosa en el celular?** Queda solo en tu navegador y solo sirve para este repo. Si preferís, cada uno puede crear su propia llave en vez de compartir una.

**¿Puedo ver el historial de cambios?** Sí: cada gasto agregado/borrado queda como un commit en el repo. GitHub guarda todo el historial.

---

Hecho con ❤️ para que nadie pague de más.
