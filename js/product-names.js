// Nombres comunes de minisúper para sugerir al registrar un producto.
import { normalize } from './core.js';

export const PRODUCT_NAME_SUGGESTIONS = {
  Abarrotes: [
    'Arroz 1 kg', 'Arroz 500 g', 'Frijol negro 1 kg', 'Frijol pinto 1 kg', 'Frijol bayo 1 kg', 'Lenteja 500 g', 'Garbanzo 500 g', 'Harina de trigo 1 kg',
    'Harina de maíz 1 kg', 'Pasta para sopa 200 g', 'Spaghetti 200 g', 'Sopa instantánea', 'Sopa de vaso', 'Puré de tomate 210 g', 'Consomé de pollo en cubos', 'Gelatina en polvo',
    'Flan en polvo', 'Polvo para hornear', 'Levadura en polvo', 'Sal de mesa 1 kg', 'Bicarbonato de sodio', 'Maicena 95 g', 'Mole en pasta', 'Pinole 500 g',
  ],
  'Aceites y condimentos': [
    'Aceite vegetal 1 L', 'Aceite vegetal 500 ml', 'Aceite de oliva 500 ml', 'Manteca vegetal 1 kg', 'Vinagre blanco 500 ml', 'Mayonesa 190 g', 'Mayonesa 390 g', 'Mostaza 200 g',
    'Salsa cátsup 390 g', 'Salsa picante 150 ml', 'Salsa inglesa 145 ml', 'Salsa de soya 145 ml', 'Pimienta molida', 'Comino molido', 'Orégano seco', 'Canela en raja',
    'Chile piquín molido', 'Sazonador en polvo', 'Ajo en polvo',
  ],
  'Aguas y jugos': [
    'Agua natural 600 ml', 'Agua natural 1 L', 'Agua natural 1.5 L', 'Agua natural 5 L', 'Garrafón de agua 20 L', 'Agua mineral 600 ml', 'Agua de sabor 600 ml', 'Jugo de naranja 1 L',
    'Jugo de manzana 1 L', 'Jugo de mango 1 L', 'Jugo en caja 200 ml', 'Néctar de durazno 1 L', 'Bebida isotónica 600 ml', 'Bebida energizante 473 ml', 'Polvo para agua de sabor',
  ],
  'Artículos para bebé': [
    'Pañales etapa 1', 'Pañales etapa 2', 'Pañales etapa 3', 'Pañales etapa 4', 'Pañales etapa 5', 'Toallitas húmedas', 'Fórmula infantil 400 g', 'Papilla de frutas 113 g',
    'Biberón', 'Chupón', 'Shampoo para bebé', 'Talco para bebé', 'Crema para rozaduras',
  ],
  Botanas: [
    'Papas fritas 45 g', 'Papas fritas 170 g', 'Frituras de maíz 60 g', 'Totopos 200 g', 'Cacahuates salados 100 g', 'Cacahuates japoneses 100 g', 'Palomitas para microondas', 'Chicharrón de harina',
    'Semillas de girasol', 'Pepitas saladas', 'Churritos enchilados', 'Mezcla de botanas 200 g',
  ],
  'Café, té y azúcar': [
    'Café soluble 50 g', 'Café soluble 120 g', 'Café molido 400 g', 'Café en sobre', 'Té de manzanilla', 'Té de limón', 'Té negro', 'Azúcar estándar 1 kg',
    'Azúcar refinada 1 kg', 'Azúcar morena 1 kg', 'Sustituto de azúcar', 'Crema para café 200 g', 'Chocolate en tablilla', 'Chocolate en polvo 400 g', 'Piloncillo',
  ],
  'Cereales y granos': [
    'Cereal de maíz 300 g', 'Cereal azucarado 300 g', 'Cereal de chocolate 300 g', 'Avena en hojuelas 400 g', 'Avena en hojuelas 1 kg', 'Granola 400 g', 'Barra de cereal', 'Maíz palomero 500 g',
    'Soya texturizada 300 g',
  ],
  'Cervezas, vinos y licores': [
    'Cerveza clara lata 355 ml', 'Cerveza oscura lata 355 ml', 'Cerveza botella 355 ml', 'Cerveza caguama 940 ml', 'Six de cerveza', 'Tequila 750 ml', 'Mezcal 750 ml', 'Ron 750 ml',
    'Brandy 750 ml', 'Vodka 750 ml', 'Vino tinto 750 ml', 'Bebida preparada lata 355 ml',
  ],
  Cigarros: ['Cajetilla de cigarros 20', 'Cajetilla de cigarros 14', 'Cigarros mentolados 20', 'Encendedor', 'Cerillos'],
  Congelados: [
    'Hielo en bolsa 5 kg', 'Paleta de hielo', 'Helado 1 L', 'Helado en vaso', 'Verduras congeladas 500 g', 'Papas a la francesa congeladas', 'Nuggets de pollo congelados', 'Pizza congelada', 'Hamburguesas congeladas',
  ],
  'Dulces y chocolates': [
    'Chicle en tira', 'Chicle en caja', 'Paleta de caramelo', 'Caramelo suelto', 'Dulce de tamarindo', 'Dulce enchilado', 'Mazapán de cacahuate', 'Chocolate en barra',
    'Chocolate con leche 40 g', 'Bombón', 'Gomitas 100 g', 'Mentas', 'Cajeta 370 g', 'Palanqueta de cacahuate', 'Alegría de amaranto', 'Oblea con cajeta',
  ],
  'Enlatados y conservas': [
    'Atún en agua 140 g', 'Atún en aceite 140 g', 'Sardinas en tomate 425 g', 'Chiles jalapeños 220 g', 'Chiles chipotles 220 g', 'Elote en grano 220 g', 'Chícharos enlatados 220 g', 'Frijoles refritos 430 g',
    'Duraznos en almíbar 820 g', 'Piña en almíbar 800 g', 'Leche condensada 387 g', 'Leche evaporada 360 g', 'Media crema 190 g', 'Mermelada de fresa 470 g', 'Miel de abeja 300 g', 'Crema de cacahuate 340 g',
  ],
  'Farmacia y botiquín': [
    'Analgésico en tabletas', 'Antiácido en tabletas', 'Suero oral 625 ml', 'Curitas', 'Alcohol 250 ml', 'Agua oxigenada 250 ml', 'Algodón 50 g', 'Gasas', 'Cubrebocas', 'Gel antibacterial 250 ml', 'Pastillas para la garganta',
  ],
  'Frutas y verduras': [
    'Jitomate', 'Tomate verde', 'Cebolla blanca', 'Papa', 'Zanahoria', 'Chile serrano', 'Chile jalapeño', 'Limón', 'Naranja', 'Plátano', 'Manzana', 'Aguacate', 'Calabacita', 'Pepino', 'Ajo', 'Cilantro manojo', 'Lechuga pieza', 'Sandía', 'Papaya', 'Mango',
  ],
  Galletas: [
    'Galletas de vainilla', 'Galletas de chocolate', 'Galletas saladas', 'Galletas integrales', 'Galletas surtidas', 'Galletas marías', 'Galletas rellenas', 'Galletas de animalitos', 'Barquillos',
  ],
  'Higiene personal': [
    'Shampoo 400 ml', 'Shampoo 750 ml', 'Acondicionador 400 ml', 'Jabón de tocador 150 g', 'Jabón líquido para manos', 'Pasta dental 100 ml', 'Cepillo de dientes', 'Enjuague bucal 500 ml',
    'Desodorante en barra', 'Desodorante en aerosol', 'Rastrillo desechable', 'Crema corporal 400 ml', 'Crema para peinar', 'Gel para el cabello 250 g', 'Toallas femeninas', 'Tampones', 'Protectores diarios', 'Papel higiénico 4 rollos', 'Papel higiénico 12 rollos', 'Pañuelos desechables', 'Hisopos',
  ],
  'Lácteos y huevo': [
    'Leche entera 1 L', 'Leche deslactosada 1 L', 'Leche light 1 L', 'Leche sabor chocolate 250 ml', 'Leche en polvo 360 g', 'Yogur natural 1 L', 'Yogur bebible 220 g', 'Yogur con fruta 150 g',
    'Crema 200 ml', 'Crema 450 ml', 'Mantequilla 90 g', 'Margarina 90 g', 'Queso crema 190 g', 'Queso panela 400 g', 'Queso manchego rebanado 200 g', 'Huevo blanco 12 piezas', 'Huevo blanco 18 piezas', 'Huevo blanco 30 piezas',
  ],
  'Limpieza del hogar': [
    'Detergente en polvo 500 g', 'Detergente en polvo 1 kg', 'Detergente líquido 1 L', 'Suavizante de telas 850 ml', 'Cloro 1 L', 'Cloro 2 L', 'Limpiador multiusos 1 L', 'Limpiador de pisos 1 L',
    'Lavatrastes líquido 500 ml', 'Lavatrastes en pasta 400 g', 'Jabón de barra para ropa', 'Fibra para trastes', 'Esponja para trastes', 'Bolsas para basura', 'Aromatizante en aerosol', 'Insecticida en aerosol', 'Servilletas 100 piezas', 'Toalla de cocina', 'Escoba', 'Trapeador', 'Recogedor', 'Guantes de hule', 'Pastilla para sanitario',
  ],
  Mascotas: ['Croquetas para perro 1 kg', 'Croquetas para perro 4 kg', 'Croquetas para gato 1 kg', 'Alimento húmedo para perro', 'Alimento húmedo para gato', 'Arena para gato 4 kg', 'Premios para perro', 'Collar antipulgas'],
  'Pan y tortillas': [
    'Pan de caja blanco', 'Pan de caja integral', 'Pan molido 210 g', 'Medias noches', 'Bollos para hamburguesa', 'Bolillo', 'Telera', 'Concha', 'Pan dulce surtido', 'Pastelito individual', 'Donas 6 piezas', 'Tostadas de maíz', 'Tortillas de harina 10 piezas',
  ],
  Papelería: ['Cuaderno profesional', 'Cuaderno forma francesa', 'Lápiz', 'Bolígrafo', 'Goma de borrar', 'Sacapuntas', 'Pegamento en barra', 'Cinta adhesiva', 'Tijeras escolares', 'Colores 12 piezas', 'Hojas blancas 100', 'Pilas AA 2 piezas', 'Pilas AAA 2 piezas'],
  'Por peso': ['Queso Oaxaca', 'Queso panela', 'Queso manchego', 'Queso chihuahua', 'Crema a granel', 'Tortilla de maíz', 'Masa de maíz', 'Frijol a granel', 'Arroz a granel', 'Azúcar a granel', 'Croquetas a granel'],
  'Recargas y servicios': ['Recarga telefónica $20', 'Recarga telefónica $50', 'Recarga telefónica $100', 'Recarga telefónica $200', 'Pago de servicio', 'Copia', 'Impresión'],
  Refrescos: [
    'Refresco de cola 355 ml', 'Refresco de cola 600 ml', 'Refresco de cola 1.5 L', 'Refresco de cola 2.5 L', 'Refresco de cola lata 355 ml', 'Refresco de naranja 600 ml', 'Refresco de naranja 2 L', 'Refresco de lima-limón 600 ml', 'Refresco de lima-limón 2 L', 'Refresco de manzana 600 ml', 'Refresco de toronja 600 ml', 'Refresco de sabor 2 L', 'Agua tónica 355 ml',
  ],
  'Salchichonería y carnes': [
    'Jamón de pavo', 'Jamón de cerdo', 'Salchicha de pavo', 'Salchicha de cerdo', 'Chorizo', 'Longaniza', 'Tocino', 'Mortadela', 'Pollo entero', 'Pechuga de pollo', 'Pierna de pollo', 'Carne molida de res', 'Bistec de res', 'Chuleta de cerdo',
    'Jamón de pavo paquete 250 g', 'Salchicha paquete 500 g',
  ],
  Sueltos: ['Huevo por pieza', 'Cigarro suelto', 'Dulce suelto', 'Pañal suelto', 'Tortilla por pieza', 'Pan suelto'],
};

const INDEX = Object.entries(PRODUCT_NAME_SUGGESTIONS).flatMap(([category, names]) => names
  .map((name) => ({ name, category, search: normalize(name) })));

export const SOLD_BY_WEIGHT_CATEGORIES = ['Frutas y verduras', 'Por peso', 'Salchichonería y carnes'];

// Busca sin importar acentos. Primero van los nombres que empiezan con lo escrito.
export function searchProductNames(query, limit = 6) {
  const text = normalize(query).trim();
  if (text.length < 2) return [];
  const words = text.split(/\s+/);
  return INDEX
    .filter((item) => words.every((word) => item.search.includes(word)))
    .sort((a, b) => Number(b.search.startsWith(text)) - Number(a.search.startsWith(text)) || a.name.localeCompare(b.name, 'es'))
    .slice(0, limit);
}
