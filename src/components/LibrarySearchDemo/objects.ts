export type Category = 'Chair' | 'Table' | 'Set' | 'Linen' | 'Staging' | 'Lighting' | 'Decor';

export type LibraryObject = {
  id: string;
  name: string;
  category: Category;
  colour: string;
  material: string;
  /** Feet and inches, the way the library stores a footprint. */
  size: string;
  /** Places at a table or a set; the concatenation writes it out as "N seats". */
  seats?: number;
  /** Whatever else a librarian typed against the object. */
  notes?: string;
};

/* Mock rows, not the product's: an event furniture library of the kind the search runs
   over, invented for this sheet. A few sizes are here on purpose. A bare 8 typed as a
   prefix would match 8ft, 8in and 81, all wrong; the quoted "8" still finds the
   candelabra's 8 arms, which is right, and "8 seats" does not. */
export const libraryObjects: readonly LibraryObject[] = [
  { id: '20101', name: 'Banquet Chair', category: 'Chair', colour: 'Silver', material: 'Steel', size: '1ft6in by 1ft8in', notes: 'padded stacking chair' },
  { id: '20102', name: 'Chiavari Chair', category: 'Chair', colour: 'Gold', material: 'Resin', size: '1ft4in by 1ft4in', notes: 'wedding chair, cushion included' },
  { id: '20103', name: 'Chiavari Chair', category: 'Chair', colour: 'Clear', material: 'Polycarbonate', size: '1ft4in by 1ft4in', notes: 'ghost finish' },
  { id: '20104', name: 'Folding Chair', category: 'Chair', colour: 'White', material: 'Resin', size: '1ft6in by 1ft6in', notes: 'garden, ceremony' },
  { id: '20105', name: 'Crossback Chair', category: 'Chair', colour: 'Wood', material: 'Oak', size: '1ft6in by 1ft8in', notes: 'rustic' },
  { id: '20106', name: 'Bentwood Chair', category: 'Chair', colour: 'Wood', material: 'Beech', size: '1ft5in by 1ft7in' },
  { id: '20107', name: 'Conference Chair', category: 'Chair', colour: 'Black', material: 'Mesh', size: '2ft by 2ft', notes: 'swivel, armrests' },
  { id: '20108', name: 'Bar Stool', category: 'Chair', colour: 'Black', material: 'Steel', size: '1ft4in by 1ft4in', notes: 'high chair for cocktail tables' },
  { id: '20109', name: 'Lounge Armchair', category: 'Chair', colour: 'Grey', material: 'Fabric', size: '2ft8in by 2ft10in' },
  { id: '20110', name: 'Lounge Sofa', category: 'Chair', colour: 'Grey', material: 'Fabric', size: '6ft by 2ft10in', seats: 3 },

  { id: '20201', name: 'Round Table', category: 'Table', colour: 'White', material: 'Laminate', size: '5ft round', seats: 8 },
  { id: '20202', name: 'Round Table', category: 'Table', colour: 'White', material: 'Laminate', size: '6ft round', seats: 10 },
  { id: '20203', name: 'Round Table', category: 'Table', colour: 'Wood', material: 'Birch', size: '6ft round', seats: 12 },
  { id: '20204', name: 'Trestle Table', category: 'Table', colour: 'White', material: 'Laminate', size: '8ft by 2ft6in', seats: 10 },
  { id: '20205', name: 'Trestle Table', category: 'Table', colour: 'White', material: 'Laminate', size: '6ft by 2ft6in', seats: 6 },
  { id: '20206', name: 'Harvest Table', category: 'Table', colour: 'Wood', material: 'Oak', size: '8ft by 3ft', seats: 8, notes: 'farmhouse' },
  { id: '20207', name: 'Conference Table', category: 'Table', colour: 'Wood', material: 'Walnut', size: '12ft by 4ft', seats: 12, notes: 'boardroom' },
  { id: '20208', name: 'Cocktail Table', category: 'Table', colour: 'Black', material: 'Steel', size: '2ft round', notes: 'standing height, no chairs' },
  { id: '20209', name: 'Sweetheart Table', category: 'Table', colour: 'Gold', material: 'Steel', size: '5ft by 2ft6in', seats: 2 },
  { id: '20210', name: 'Buffet Table', category: 'Table', colour: 'White', material: 'Laminate', size: '6ft by 2ft6in' },

  { id: '20301', name: 'Banquet Set', category: 'Set', colour: 'Gold', material: 'Laminate', size: '5ft round', seats: 8, notes: 'round table with gold chiavari chairs' },
  { id: '20302', name: 'Banquet Set', category: 'Set', colour: 'White', material: 'Laminate', size: '6ft round', seats: 10, notes: 'round table with white folding chairs' },
  { id: '20303', name: 'Banquet Set', category: 'Set', colour: 'Gold', material: 'Birch', size: '6ft round', seats: 12, notes: 'round table with gold chiavari chairs' },
  { id: '20304', name: 'Boardroom Set', category: 'Set', colour: 'Black', material: 'Walnut', size: '12ft by 4ft', seats: 12, notes: 'conference table with mesh chairs' },
  { id: '20305', name: 'Classroom Set', category: 'Set', colour: 'White', material: 'Laminate', size: '6ft by 2ft6in', seats: 3, notes: 'trestle table facing forward' },

  { id: '20401', name: 'Round Tablecloth', category: 'Linen', colour: 'Ivory', material: 'Polyester', size: '10ft round', notes: 'fits a 5ft round table' },
  { id: '20402', name: 'Table Runner', category: 'Linen', colour: 'Gold', material: 'Sequin', size: '9ft by 1ft' },
  { id: '20403', name: 'Chair Cover', category: 'Linen', colour: 'White', material: 'Spandex', size: 'fits banquet chair' },
  { id: '20404', name: 'Chair Sash', category: 'Linen', colour: 'Gold', material: 'Organza', size: '9ft by 8in', notes: 'tied round a chair back' },

  { id: '20501', name: 'Stage Riser', category: 'Staging', colour: 'Black', material: 'Aluminium', size: '8ft by 4ft', notes: 'two foot high' },
  { id: '20502', name: 'Stage Steps', category: 'Staging', colour: 'Black', material: 'Aluminium', size: '3ft by 2ft', notes: 'three treads' },
  { id: '20503', name: 'Dance Floor', category: 'Staging', colour: 'Black and White', material: 'Vinyl', size: '27ft by 27ft', notes: '81 panels' },
  { id: '20504', name: 'Pipe and Drape', category: 'Staging', colour: 'Black', material: 'Velour', size: '10ft by 8ft', notes: 'backdrop' },
  { id: '20505', name: 'Lectern', category: 'Staging', colour: 'Wood', material: 'Oak', size: '2ft by 1ft8in' },

  { id: '20601', name: 'Chandelier', category: 'Lighting', colour: 'Gold', material: 'Crystal', size: '3ft round' },
  { id: '20602', name: 'Uplighter', category: 'Lighting', colour: 'Black', material: 'LED', size: '8in by 8in', notes: 'colour changing' },
  { id: '20603', name: 'Festoon Lights', category: 'Lighting', colour: 'Warm White', material: 'LED', size: '50ft run' },
  { id: '20604', name: 'Candelabra', category: 'Lighting', colour: 'Gold', material: 'Brass', size: '2ft6in high', notes: '8 arms' },

  { id: '20701', name: 'Centrepiece Vase', category: 'Decor', colour: 'Clear', material: 'Glass', size: '1ft8in high' },
  { id: '20702', name: 'Charger Plate', category: 'Decor', colour: 'Gold', material: 'Acrylic', size: '1ft1in round', notes: 'one per chair' },
  { id: '20703', name: 'Floral Arch', category: 'Decor', colour: 'White', material: 'Steel', size: '8ft by 7ft', notes: 'ceremony' },
  { id: '20704', name: 'Welcome Easel', category: 'Decor', colour: 'Gold', material: 'Brass', size: '5ft high' },
];

/** What the concatenation triggers keep in one FULLTEXT-indexed column per object: every
    property, the typed ones and the derived ones, flattened into a single string. The
    category is a column of the object, not a property, so it is filtered on but never
    matched. */
export function concatenatedValues(object: LibraryObject) {
  return [
    object.name,
    object.colour,
    object.material,
    object.size,
    object.seats === undefined ? null : `${object.seats} seats`,
    object.notes,
  ]
    .filter(Boolean)
    .join(' ');
}

/** The line under a result's name. */
export function detailsOf(object: LibraryObject) {
  return [object.colour, object.material, object.size, object.seats === undefined ? null : `${object.seats} seats`]
    .filter(Boolean)
    .join(' · ');
}

export const categories: readonly Category[] = [...new Set(libraryObjects.map((object) => object.category))];

/** The colour filter offers what is stored, the way a property filter lists the values
    it has seen. */
export const colours: readonly string[] = [...new Set(libraryObjects.map((object) => object.colour))].sort();

/** The query the page opens on, the one the proposal's wireframe draws. */
export const initialQuery = 'chair 8 seats';

/** The walkthrough's script: each step is typed into the field, then held long enough to
    read the bars. `colour` sets the colour filter instead of typing. */
export const walkthrough: readonly { type?: string; clear?: boolean; colour?: string; hold: number }[] = [
  { clear: true, type: 'chair', hold: 1800 },
  { type: ' 8', hold: 1800 },
  { type: ' seats', hold: 2600 },
  { clear: true, type: 'round table', hold: 1800 },
  { colour: 'Gold', hold: 2600 },
  { colour: '', hold: 800 },
];
