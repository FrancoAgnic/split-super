# 🛒 Split Súper

App para dividir los gastos del supermercado entre roomies **según lo que compró cada uno**, no en partes iguales.

Pagan todo con **una sola tarjeta**, pero cada uno carga sus propias cosas y la app dice cuánto gastó realmente cada uno y cuánto le debe a quien puso la tarjeta.

- ✅ Cada uno carga sus gastos.
- ✅ Total por persona y total del mes.
- ✅ Elegís quién pagó con la tarjeta → la app calcula cuánto le debe cada uno.
- ✅ **Compartido con un link**: sin cuentas, sin contraseñas, sin tokens.
- ✅ Organizado por mes.

## 🔗 ¿Cómo se comparte? (súper simple)

1. Abrís la app y tocás **➕ Crear grupo compartido**.
2. Se genera un **link**. Tocás **Compartir → Copiar** y se lo mandás a tus roomies.
3. Ellos **abren el link** y ya están adentro: ven y editan los mismos gastos.

Eso es todo. No hay que instalar ni registrarse en nada.

> 💡 En el celular: "Agregar a pantalla de inicio" para que quede como una app.

## 🧠 ¿Dónde se guardan los datos?

En **[jsonblob.com](https://jsonblob.com)**, un almacén de JSON gratis y sin login. Cada grupo es un "blob" con un id, y ese id viaja dentro del link que compartís. Quien tiene el link, ve y edita.

Es una app **casual entre amigos**: cualquiera con el link puede editar (no hay seguridad, y está bien así). Si el link se te pierde, cualquiera del grupo que lo tenga guardado te lo puede volver a pasar.

> ⚠️ jsonblob borra los grupos que quedan **sin usarse ~30 días**. Si eso pasa, la app te avisa y te ofrece **recrear el grupo** con los datos que quedaron guardados en tu dispositivo (y te da un link nuevo para repartir).

## 🖥️ Publicar la app (GitHub Pages)

La app es web pura y se publica gratis:

1. **Settings → Pages** → Source: *Deploy from a branch* → Branch `main` / carpeta `/ (root)` → Save.
2. Queda en `https://francoagnic.github.io/split-super/`.

## 🧩 Estructura

```
index.html   Estructura de la página
styles.css   Estilos (tema oscuro, responsive)
app.js       Lógica + guardado en jsonblob
config.js    A qué almacén apuntar
```

## 🗂️ Formato de datos

```json
{
  "people": ["Ana", "Beto", "Caro", "Dani"],
  "expenses": [
    { "id": "abc123", "month": "2026-09", "person": "Ana", "description": "Leche", "amount": 950, "ts": 1725400000000 }
  ],
  "months": { "2026-09": { "paidBy": "Ana" } }
}
```

---

Hecho con ❤️ para que nadie pague de más.
