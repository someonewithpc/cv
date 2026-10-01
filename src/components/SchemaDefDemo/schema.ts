/**
 * The sheet's one input and the transform it goes through.
 *
 * `actorSource` is GNU social v3's `Actor::schemaDef()` as it stands in src/Entity/Actor.php,
 * character for character. Everything else on the main sheet is read out of that text: the
 * field options are parsed from it, pushed through a port of SchemaDefDriver's
 * `loadMetadataForClass`, and printed the way Doctrine DBAL's MySQL platform prints a
 * CREATE TABLE. Nothing on the right-hand pane is typed in by hand, so the two panes cannot
 * drift apart.
 */

export const actorSource = String.raw`    public static function schemaDef(): array
    {
        return [
            'name'        => 'actor',
            'description' => 'local and remote users, groups and bots are actors, for instance',
            'fields'      => [
                'id'               => ['type' => 'serial', 'not null' => true, 'description' => 'unique identifier'],
                'nickname'         => ['type' => 'varchar', 'length' => 64, 'not null' => true, 'description' => 'nickname or username'],
                'fullname'         => ['type' => 'text', 'description' => 'display name', 'default' => null],
                'roles'            => ['type' => 'int', 'not null' => true, 'description' => 'Bitmap of permissions this actor has'],
                'type'             => ['type' => 'int', 'not null' => true, 'description' => 'The type of actor (person, group, bot, etc)'],
                'homepage'         => ['type' => 'text', 'description' => 'identifying URL', 'default' => null],
                'bio'              => ['type' => 'text', 'description' => 'descriptive biography', 'default' => null],
                'location'         => ['type' => 'text', 'description' => 'physical location', 'default' => null],
                'lat'              => ['type' => 'numeric', 'precision' => 10, 'scale' => 7, 'description' => 'latitude', 'default' => null],
                'lon'              => ['type' => 'numeric', 'precision' => 10, 'scale' => 7, 'description' => 'longitude', 'default' => null],
                'location_id'      => ['type' => 'int', 'description' => 'location id if possible', 'default' => null],
                'location_service' => ['type' => 'int', 'description' => 'service used to obtain location id', 'default' => null],
                'is_local'         => ['type' => 'bool', 'not null' => true, 'description' => 'Does this actor have a LocalUser associated'],
                'created'          => ['type' => 'datetime', 'not null' => true, 'default' => 'CURRENT_TIMESTAMP', 'description' => 'date this record was created'],
                'modified'         => ['type' => 'timestamp', 'not null' => true, 'default' => 'CURRENT_TIMESTAMP', 'description' => 'date this record was modified'],
            ],
            'primary key' => ['id'],
            'indexes'     => [
                'actor_nickname_idx' => ['nickname'],
            ],
            'fulltext indexes' => [
                'actor_fulltext_idx' => ['nickname', 'fullname', 'location', 'bio', 'homepage'],
            ],
        ];
    }`;

/** SchemaDefDriver::types, verbatim: the v2 name on the left, Doctrine's on the right. */
export const driverTypes: Record<string, string> = {
  varchar: 'string',
  char: 'string',
  int: 'integer',
  serial: 'integer',
  tinyint: 'smallint',
  bigint: 'bigint',
  bool: 'boolean',
  numeric: 'decimal',
  text: 'text',
  datetime: 'datetime',
  timestamp: 'datetime',
  phone_number: 'phone_number',
  // Unused in V2, but might start being used
  date: 'date',
  time: 'time',
  datetimez: 'datetimez',
  object: 'object',
  array: 'array',
  simplearray: 'simplearray',
  json_array: 'json_array',
  float: 'float',
  guid: 'guid',
  blob: 'blob',
};

type Value = string | number | boolean | null;
export type Options = Record<string, Value>;

export type TokenKind = 'str' | 'num' | 'kw' | 'punct' | 'com';
export type Token = { text: string; kind?: TokenKind };

/** One printed line. `key` pairs it with its counterpart on the other pane. */
export type Line = { key?: string; indent: number; tokens: Token[] };

/** One step of a rule: the schemaDef side, the Doctrine metadata, and the SQL it becomes. */
export type Step = [php: string, doctrine: string, sql: string];

export type Rule = { key: string; label: string; steps: Step[] };

/** `'key' => value` pairs out of a one-line PHP array, scalars only. */
function parseOptions(text: string): Options {
  const options: Options = {};
  const pair = /'([^']+)'\s*=>\s*('(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|true|false|null)/g;
  for (const [, key, raw] of text.matchAll(pair)) {
    if (raw.startsWith("'")) options[key] = raw.slice(1, -1).replace(/\\'/g, "'");
    else if (raw === 'true' || raw === 'false') options[key] = raw === 'true';
    else if (raw === 'null') options[key] = null;
    else options[key] = Number(raw);
  }
  return options;
}

/** `['a', 'b']` to its strings. */
function parseList(text: string): string[] {
  return [...text.matchAll(/'([^']+)'/g)].map(([, value]) => value);
}

export type Schema = {
  name: string;
  description: string;
  fields: [string, Options][];
  primaryKey: string[];
  indexes: [string, string[]][];
  uniqueKeys: [string, string[]][];
  fulltextIndexes: [string, string[]][];
};

type Section = 'fields' | 'indexes' | 'unique keys' | 'fulltext indexes' | null;

const sectionKey: Record<Exclude<Section, null>, string> = {
  fields: 'field',
  indexes: 'index',
  'unique keys': 'unique',
  'fulltext indexes': 'fulltext',
};

/**
 * Reads a schemaDef method's text into the array it returns, and into one keyed line per
 * source line. Only the shapes a schemaDef actually uses are understood: one field or one
 * index per line, and scalar options.
 */
export function readSchemaDef(source: string): { schema: Schema; lines: Line[] } {
  const schema: Schema = {
    name: '',
    description: '',
    fields: [],
    primaryKey: [],
    indexes: [],
    uniqueKeys: [],
    fulltextIndexes: [],
  };
  const lines: Line[] = [];
  let section: Section = null;
  const baseIndent = source.match(/^ */)?.[0].length ?? 0;

  for (const raw of source.split('\n')) {
    const indent = (raw.match(/^ */)?.[0].length ?? 0) - baseIndent;
    // The file lines its `=>` up in columns. Wrapped at a sheet's width those runs of
    // padding only push the text apart, so they collapse to one space here.
    const text = raw.trim().replace(/(\S) {2,}(?=\S)/g, '$1 ');
    const entry = text.match(/^'([^']+)'\s*=>\s*(.*)$/);
    let key: string | undefined;

    if (entry && section && entry[2].startsWith('[') && !entry[2].endsWith('[')) {
      const [, name, rest] = entry;
      key = `${sectionKey[section]}:${name}`;
      if (section === 'fields') schema.fields.push([name, parseOptions(rest)]);
      else if (section === 'indexes') schema.indexes.push([name, parseList(rest)]);
      else if (section === 'unique keys') schema.uniqueKeys.push([name, parseList(rest)]);
      else schema.fulltextIndexes.push([name, parseList(rest)]);
    } else if (entry) {
      const [, name, rest] = entry;
      if (rest === '[') {
        section = name in sectionKey ? (name as Section) : null;
        // A one-entry index block reads as one thing, so its opening line lights up with it.
        if (section && section !== 'fields') key = `${sectionKey[section]}:`;
      } else if (name === 'name') {
        schema.name = parseList(rest)[0] ?? '';
        key = 'table';
      } else if (name === 'description') {
        schema.description = parseOptions(text).description as string;
        key = 'comment';
      } else if (name === 'primary key') {
        schema.primaryKey = parseList(rest);
        key = 'pk';
      }
    } else if (/^\],?$/.test(text)) {
      section = null;
    }

    lines.push({ key, indent, tokens: tokenizePhp(text) });
  }

  // An index block's opening line takes the key of the index under it.
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].key?.endsWith(':')) lines[i].key = lines[i + 1]?.key;
  }

  return { schema, lines };
}

function tokenize(text: string, pattern: RegExp, kindOf: (match: string) => TokenKind | undefined): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) tokens.push({ text: text.slice(last, at) });
    tokens.push({ text: match[0], kind: kindOf(match[0]) });
    last = at + match[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last) });
  return tokens;
}

function tokenizePhp(text: string): Token[] {
  return tokenize(
    text,
    /'(?:[^'\\]|\\.)*'|\b\d+\b|\b(?:public|static|function|array|return|true|false|null)\b|=>/g,
    (match) => {
      if (match.startsWith("'")) return 'str';
      if (/^\d/.test(match)) return 'num';
      if (match === '=>') return 'punct';
      return 'kw';
    },
  );
}

const sqlKeywords = new Set([
  'CREATE', 'TABLE', 'INT', 'SMALLINT', 'BIGINT', 'AUTO_INCREMENT', 'NOT', 'NULL', 'DEFAULT',
  'COMMENT', 'VARCHAR', 'CHAR', 'LONGTEXT', 'NUMERIC', 'TINYINT', 'DATETIME', 'DATE', 'TIME',
  'CURRENT_TIMESTAMP', 'INDEX', 'UNIQUE', 'PRIMARY', 'KEY', 'CHARACTER', 'SET', 'COLLATE',
  'ENGINE', 'UNSIGNED',
]);

function tokenizeSql(text: string): Token[] {
  if (text.startsWith('--')) return [{ text, kind: 'com' }];
  return tokenize(text, /'(?:[^']|'')*'|`[^`]*`|\b\d+\b|\b[A-Z_]+\b/g, (match) => {
    if (match.startsWith("'") || match.startsWith('`')) return 'str';
    if (/^\d/.test(match)) return 'num';
    return sqlKeywords.has(match) ? 'kw' : undefined;
  });
}

/** What loadMetadataForClass hands `mapField`, with the nulls it filters already gone. */
export type FieldMapping = {
  fieldName: string;
  type: string;
  id: boolean;
  nullable: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  default?: Value;
  comment?: string;
  unsigned?: boolean;
  fixed: boolean;
  autoincrement: boolean;
};

/** The driver's non-association branch, one field at a time. */
export function mapField(name: string, opts: Options, schema: Schema): FieldMapping {
  // Size is folded into the name before the lookup: 'size' => 'tiny' on an int is tinyint.
  const type = driverTypes[`${opts.size ?? ''}${opts.type}`];
  return {
    fieldName: name,
    type,
    id: schema.primaryKey.includes(name),
    nullable: !(opts['not null'] ?? false),
    length: (opts.length as number | undefined) ?? undefined,
    precision: (opts.precision as number | undefined) ?? undefined,
    scale: (opts.scale as number | undefined) ?? undefined,
    default: opts.default ?? undefined,
    comment: (opts.description as string | undefined) ?? undefined,
    unsigned: (opts.unsigned as boolean | undefined) ?? undefined,
    fixed: opts.type === 'char',
    autoincrement: opts.type === 'serial',
  };
}

/** A Doctrine type as DBAL's MySQL platform declares it; null for a bundle's own type. */
export function mysqlType(field: Pick<FieldMapping, 'type' | 'length' | 'precision' | 'scale' | 'fixed' | 'autoincrement' | 'unsigned'>): string | null {
  const unsigned = field.unsigned ? ' UNSIGNED' : '';
  switch (field.type) {
    case 'string':
      return `${field.fixed ? 'CHAR' : 'VARCHAR'}(${field.length ?? 255})`;
    case 'integer':
      return `INT${unsigned}${field.autoincrement ? ' AUTO_INCREMENT' : ''}`;
    case 'smallint':
      return `SMALLINT${unsigned}`;
    case 'bigint':
      return `BIGINT${unsigned}`;
    case 'boolean':
      return 'TINYINT(1)';
    case 'decimal':
      return `NUMERIC(${field.precision ?? 10}, ${field.scale ?? 0})`;
    case 'text':
      return 'LONGTEXT';
    case 'datetime':
    case 'datetimez':
      return 'DATETIME';
    case 'date':
      return 'DATE';
    case 'time':
      return 'TIME';
    case 'float':
      return 'DOUBLE PRECISION';
    case 'guid':
      return 'CHAR(36)';
    case 'blob':
      return 'LONGBLOB';
    case 'object':
    case 'array':
    case 'simplearray':
    case 'json_array':
      return 'LONGTEXT';
    default:
      return null;
  }
}

const quote = (text: string) => `'${text.replace(/'/g, "''")}'`;

function defaultSql(field: FieldMapping): string {
  if (field.default === undefined || field.default === null) return field.nullable ? ' DEFAULT NULL' : '';
  if (field.default === 'CURRENT_TIMESTAMP' && field.type === 'datetime') return ' DEFAULT CURRENT_TIMESTAMP';
  if (typeof field.default === 'boolean') return ` DEFAULT ${field.default ? 1 : 0}`;
  if (typeof field.default === 'number') return ` DEFAULT ${field.default}`;
  return ` DEFAULT ${quote(field.default)}`;
}

/** AbstractPlatform::getColumnDeclarationSQL's order: type, default, NOT NULL, comment. */
export function columnSql(field: FieldMapping): string {
  const comment = field.comment ? ` COMMENT ${quote(field.comment)}` : '';
  return `${field.fieldName} ${mysqlType(field)}${defaultSql(field)}${field.nullable ? '' : ' NOT NULL'}${comment}`;
}

/**
 * The CREATE TABLE the schema tool would run for this schemaDef on MySQL, one clause per
 * line. DBAL prints it as a single line; the clauses and their order are its own.
 */
export function createTable(schema: Schema): Line[] {
  const clauses: Line[] = [];
  const clause = (key: string | undefined, text: string, indent = 2) =>
    clauses.push({ key, indent, tokens: tokenizeSql(text) });

  const body: [string | undefined, string][] = [
    ...schema.fields.map(([name, opts]): [string, string] => [`field:${name}`, columnSql(mapField(name, opts, schema))]),
    ...schema.uniqueKeys.map(([name, cols]): [string, string] => [`unique:${name}`, `UNIQUE INDEX ${name} (${cols.join(', ')})`]),
    ...schema.indexes.map(([name, cols]): [string, string] => [`index:${name}`, `INDEX ${name} (${cols.join(', ')})`]),
  ];
  if (schema.primaryKey.length) body.push(['pk', `PRIMARY KEY(${schema.primaryKey.join(', ')})`]);

  clause('table', `CREATE TABLE ${schema.name} (`, 0);
  body.forEach(([key, text], index) => {
    clause(key, index < body.length - 1 ? `${text},` : text);
    // The driver never reads 'fulltext indexes', so nothing of it reaches Doctrine. The
    // pane says so where the index would have gone, rather than dropping the line.
    if (key?.startsWith('index:') && !body[index + 1]?.[0]?.startsWith('index:')) {
      schema.fulltextIndexes.forEach(([name]) => {
        clause(`fulltext:${name}`, `-- ${name}: not read by SchemaDefDriver`);
      });
    }
  });
  // The table options as AbstractMySQLPlatform::buildTableOptions joins them, in its order;
  // the comment is the last of them, and the only one the schemaDef had a say in.
  clause(undefined, ') DEFAULT CHARACTER SET utf8 COLLATE `utf8_unicode_ci` ENGINE = InnoDB', 0);
  clause('comment', `COMMENT = ${quote(schema.description)};`, 0);
  return clauses;
}

/** What happened to one keyed line on its way across, one step per option that mattered. */
export function rulesFor(schema: Schema): Rule[] {
  const rules: Rule[] = [
    {
      key: 'table',
      label: `'name'`,
      steps: [[`'name' => '${schema.name}'`, `setPrimaryTable(['name' => '${schema.name}'])`, `CREATE TABLE ${schema.name}`]],
    },
    {
      key: 'comment',
      label: `'description'`,
      steps: [[`'description'`, `options.comment`, `COMMENT = '…'`]],
    },
    {
      key: 'pk',
      label: `'primary key'`,
      steps: schema.primaryKey.map((name): Step => [`in 'primary key'`, `'${name}': 'id' => true`, `PRIMARY KEY(${name})`]),
    },
  ];

  for (const [name, opts] of schema.fields) {
    const field = mapField(name, opts, schema);
    const v2 = `${opts.size ?? ''}${opts.type}`;
    const sqlType = mysqlType(field) ?? field.type;
    const steps: Step[] = [[`'${v2}'`, `'${field.type}'`, sqlType.replace(' AUTO_INCREMENT', '')]];

    if (field.autoincrement) steps.push([`'serial'`, 'GENERATOR_TYPE_AUTO', 'AUTO_INCREMENT']);
    if (field.length !== undefined) steps.push([`'length' => ${field.length}`, `'length' => ${field.length}`, `(${field.length})`]);
    if (field.precision !== undefined) {
      steps.push([`'precision' => ${field.precision}, 'scale' => ${field.scale ?? 0}`, 'precision, scale', `(${field.precision}, ${field.scale ?? 0})`]);
    }
    steps.push(
      field.nullable
        ? [`no 'not null'`, `'nullable' => true`, 'DEFAULT NULL']
        : [`'not null' => true`, `'nullable' => false`, 'NOT NULL'],
    );
    if (field.default === 'CURRENT_TIMESTAMP') steps.push([`'default'`, `options.default`, 'DEFAULT CURRENT_TIMESTAMP']);
    if (field.comment) steps.push([`'description'`, 'options.comment', 'COMMENT']);
    if (field.id) steps.push([`in 'primary key'`, `'id' => true`, 'PRIMARY KEY']);

    rules.push({ key: `field:${name}`, label: `'${name}'`, steps });
  }

  for (const [name, cols] of schema.indexes) {
    rules.push({
      key: `index:${name}`,
      label: `'${name}'`,
      steps: [[`'${name}' => [${cols.map((col) => `'${col}'`).join(', ')}]`, `['name' => …, 'columns' => […]]`, `INDEX ${name}`]],
    });
  }

  for (const [name] of schema.fulltextIndexes) {
    rules.push({
      key: `fulltext:${name}`,
      label: `'${name}'`,
      steps: [[`'fulltext indexes'`, 'never read', 'no clause']],
    });
  }

  return rules;
}

export const actor = readSchemaDef(actorSource);

/** Every keyed line of the source, once: TransformLayer's walk order for the highlight and
 * the keyboard, and the keys its no-script fallback loops over. */
export const actorKeys = [...new Set(actor.lines.map((line) => line.key).filter((key): key is string => Boolean(key)))];

/** What TransformLayer's `<style lang="scss">` reads through `@use "ts:…"` (plugins/sassFromTs.mjs). */
export const sass = { actorKeys };

export const actorTable = createTable(actor.schema);
export const actorRules = rulesFor(actor.schema);
