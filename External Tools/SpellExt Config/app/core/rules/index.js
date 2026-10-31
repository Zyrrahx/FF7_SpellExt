// The ports of the DLL's readers, imported explicitly in the DLL's order (Python found them with pkgutil): each
// registers itself with validate.js under its order number, and validate.js keeps ORDER sorted by it:
//   spell names 10, game 20, shops 21, fields 25, effects 30, spells 40 (spells.js holds the spell names, effects
//   and spells readers), materia 50, weapons 60, armour/accessories/items 70-72, characters 80, limits 90.
import '../validate.js';
import './spells.js';
import './game.js';
import './shops.js';
import './fields.js';
import './materia.js';
import './weapons.js';
import './gear.js';
import './characters.js';
import './limits.js';
