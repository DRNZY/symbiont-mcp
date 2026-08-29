import {
  SourceFile,
  Node,
  FunctionDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  VariableStatement,
  VariableDeclaration,
} from 'ts-morph';
import type { ProjectManager } from './project-manager.js';
import type { FileOutlineResult, SymbolOutline, ImportOutline, SymbolKind } from '../types.js';

export function getFileOutline(
  filePath: string,
  projectManager: ProjectManager
): FileOutlineResult {
  const sourceFile = projectManager.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`File not found or could not be loaded: ${filePath}`);
  }

  const relPath = projectManager.getRelativePath(sourceFile.getFilePath());
  const totalLines = sourceFile.getEndLineNumber();

  // 1. Extract Imports
  const imports: ImportOutline[] = [];
  for (const imp of sourceFile.getImportDeclarations()) {
    const named = imp.getNamedImports().map((n) => n.getName());
    const defaultImp = imp.getDefaultImport()?.getText();
    const namespaceImp = imp.getNamespaceImport()?.getText();

    imports.push({
      moduleSpecifier: imp.getModuleSpecifierValue(),
      defaultImport: defaultImp,
      namedImports: named.length > 0 ? named : undefined,
      namespaceImport: namespaceImp,
      isTypeOnly: imp.isTypeOnly(),
      line: imp.getStartLineNumber(),
    });
  }

  // 2. Extract Exports
  const exportedSymbols: string[] = [];
  const exportMap = sourceFile.getExportedDeclarations();
  for (const [name] of exportMap) {
    exportedSymbols.push(name);
  }

  // 3. Extract Top-Level Symbols
  const symbols: SymbolOutline[] = [];

  for (const statement of sourceFile.getStatements()) {
    const symbol = extractStatementSymbol(statement);
    if (symbol) {
      symbols.push(symbol);
    }
  }

  return {
    filePath: relPath,
    totalLines,
    imports,
    exports: exportedSymbols,
    symbols,
  };
}

function extractStatementSymbol(node: Node): SymbolOutline | null {
  const sf = node.getSourceFile();
  const startPos = sf.getLineAndColumnAtPos(node.getStart());
  const endPos = sf.getLineAndColumnAtPos(node.getEnd());
  const startLine = startPos.line;
  const endLine = endPos.line;
  const startColumn = startPos.column;
  const endColumn = endPos.column;

  // Functions
  if (Node.isFunctionDeclaration(node)) {
    return extractFunctionSymbol(node, startLine, endLine, startColumn, endColumn);
  }

  // Classes
  if (Node.isClassDeclaration(node)) {
    return extractClassSymbol(node, startLine, endLine, startColumn, endColumn);
  }

  // Interfaces
  if (Node.isInterfaceDeclaration(node)) {
    return extractInterfaceSymbol(node, startLine, endLine, startColumn, endColumn);
  }

  // Type Aliases
  if (Node.isTypeAliasDeclaration(node)) {
    return extractTypeAliasSymbol(node, startLine, endLine, startColumn, endColumn);
  }

  // Enums
  if (Node.isEnumDeclaration(node)) {
    return extractEnumSymbol(node, startLine, endLine, startColumn, endColumn);
  }

  // Variable Statements (const/let/var)
  if (Node.isVariableStatement(node)) {
    const decls = node.getDeclarations();
    if (decls.length > 0) {
      const firstDecl = decls[0];
      return extractVariableSymbol(node, firstDecl, startLine, endLine, startColumn, endColumn);
    }
  }

  return null;
}

function extractFunctionSymbol(
  fn: FunctionDeclaration,
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number
): SymbolOutline {
  const name = fn.getName() || '<anonymous>';
  const isExported = fn.isExported();
  const isDefaultExport = fn.isDefaultExport();
  const params = fn.getParameters().map((p) => p.getText()).join(', ');
  const returnType = fn.getReturnTypeNode()?.getText() || fn.getReturnType().getText(fn);
  const isAsync = fn.isAsync() ? 'async ' : '';
  const isGen = fn.isGenerator() ? '*' : '';

  const signature = `${isExported ? 'export ' : ''}${isDefaultExport ? 'default ' : ''}${isAsync}function${isGen} ${name}(${params}): ${returnType}`;
  const docComment = fn.getJsDocs().map((d) => d.getCommentText() || '').join('\n') || undefined;

  return {
    name,
    kind: 'function',
    isExported,
    isDefaultExport,
    startLine,
    endLine,
    startColumn,
    endColumn,
    signature,
    docComment,
  };
}

function extractClassSymbol(
  cls: ClassDeclaration,
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number
): SymbolOutline {
  const name = cls.getName() || '<anonymous>';
  const isExported = cls.isExported();
  const isDefaultExport = cls.isDefaultExport();
  const extendsClause = cls.getExtends()?.getText();
  const implementsClause = cls.getImplements().map((i) => i.getText()).join(', ');

  let signature = `${isExported ? 'export ' : ''}${isDefaultExport ? 'default ' : ''}class ${name}`;
  if (extendsClause) signature += ` extends ${extendsClause}`;
  if (implementsClause) signature += ` implements ${implementsClause}`;

  const docComment = cls.getJsDocs().map((d) => d.getCommentText() || '').join('\n') || undefined;

  const children: SymbolOutline[] = [];

  for (const c of cls.getConstructors()) {
    const cParams = c.getParameters().map((p) => p.getText()).join(', ');
    children.push({
      name: 'constructor',
      kind: 'constructor',
      isExported: false,
      isDefaultExport: false,
      startLine: c.getStartLineNumber(),
      endLine: c.getEndLineNumber(),
      startColumn: 1,
      endColumn: 1,
      signature: `constructor(${cParams})`,
    });
  }

  for (const method of cls.getMethods()) {
    const mName = method.getName();
    const mParams = method.getParameters().map((p) => p.getText()).join(', ');
    const mReturn = method.getReturnTypeNode()?.getText() || method.getReturnType().getText(method);
    const mScope = method.getScope() || 'public';
    const mAsync = method.isAsync() ? 'async ' : '';
    const mStatic = method.isStatic() ? 'static ' : '';

    children.push({
      name: mName,
      kind: 'method',
      isExported: false,
      isDefaultExport: false,
      startLine: method.getStartLineNumber(),
      endLine: method.getEndLineNumber(),
      startColumn: 1,
      endColumn: 1,
      signature: `${mScope} ${mStatic}${mAsync}${mName}(${mParams}): ${mReturn}`,
    });
  }

  for (const prop of cls.getProperties()) {
    const pName = prop.getName();
    const pType = prop.getTypeNode()?.getText() || prop.getType().getText(prop);
    const pScope = prop.getScope() || 'public';
    const pStatic = prop.isStatic() ? 'static ' : '';
    const pReadonly = prop.isReadonly() ? 'readonly ' : '';

    children.push({
      name: pName,
      kind: 'property',
      isExported: false,
      isDefaultExport: false,
      startLine: prop.getStartLineNumber(),
      endLine: prop.getEndLineNumber(),
      startColumn: 1,
      endColumn: 1,
      signature: `${pScope} ${pStatic}${pReadonly}${pName}: ${pType}`,
    });
  }

  return {
    name,
    kind: 'class',
    isExported,
    isDefaultExport,
    startLine,
    endLine,
    startColumn,
    endColumn,
    signature,
    docComment,
    children: children.length > 0 ? children : undefined,
  };
}

function extractInterfaceSymbol(
  iface: InterfaceDeclaration,
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number
): SymbolOutline {
  const name = iface.getName();
  const isExported = iface.isExported();
  const isDefaultExport = iface.isDefaultExport();
  const extendsClause = iface.getExtends().map((e) => e.getText()).join(', ');

  let signature = `${isExported ? 'export ' : ''}interface ${name}`;
  if (extendsClause) signature += ` extends ${extendsClause}`;

  const docComment = iface.getJsDocs().map((d) => d.getCommentText() || '').join('\n') || undefined;

  const children: SymbolOutline[] = [];
  for (const prop of iface.getProperties()) {
    children.push({
      name: prop.getName(),
      kind: 'property',
      isExported: false,
      isDefaultExport: false,
      startLine: prop.getStartLineNumber(),
      endLine: prop.getEndLineNumber(),
      startColumn: 1,
      endColumn: 1,
      signature: `${prop.getName()}${prop.hasQuestionToken() ? '?' : ''}: ${prop.getTypeNode()?.getText() || prop.getType().getText(prop)}`,
    });
  }

  for (const method of iface.getMethods()) {
    const mParams = method.getParameters().map((p) => p.getText()).join(', ');
    const mReturn = method.getReturnTypeNode()?.getText() || method.getReturnType().getText(method);
    children.push({
      name: method.getName(),
      kind: 'method',
      isExported: false,
      isDefaultExport: false,
      startLine: method.getStartLineNumber(),
      endLine: method.getEndLineNumber(),
      startColumn: 1,
      endColumn: 1,
      signature: `${method.getName()}(${mParams}): ${mReturn}`,
    });
  }

  return {
    name,
    kind: 'interface',
    isExported,
    isDefaultExport,
    startLine,
    endLine,
    startColumn,
    endColumn,
    signature,
    docComment,
    children: children.length > 0 ? children : undefined,
  };
}

function extractTypeAliasSymbol(
  alias: TypeAliasDeclaration,
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number
): SymbolOutline {
  const name = alias.getName();
  const isExported = alias.isExported();
  const isDefaultExport = alias.isDefaultExport();
  const typeText = alias.getTypeNode()?.getText() || alias.getType().getText(alias);
  const truncatedType = typeText.length > 80 ? `${typeText.slice(0, 77)}...` : typeText;
  const signature = `${isExported ? 'export ' : ''}type ${name} = ${truncatedType}`;
  const docComment = alias.getJsDocs().map((d) => d.getCommentText() || '').join('\n') || undefined;

  return {
    name,
    kind: 'type_alias',
    isExported,
    isDefaultExport,
    startLine,
    endLine,
    startColumn,
    endColumn,
    signature,
    docComment,
  };
}

function extractEnumSymbol(
  en: EnumDeclaration,
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number
): SymbolOutline {
  const name = en.getName();
  const isExported = en.isExported();
  const isDefaultExport = en.isDefaultExport();
  const members = en.getMembers().map((m) => m.getName()).join(', ');
  const signature = `${isExported ? 'export ' : ''}enum ${name} { ${members} }`;
  const docComment = en.getJsDocs().map((d) => d.getCommentText() || '').join('\n') || undefined;

  return {
    name,
    kind: 'enum',
    isExported,
    isDefaultExport,
    startLine,
    endLine,
    startColumn,
    endColumn,
    signature,
    docComment,
  };
}

function extractVariableSymbol(
  stmt: VariableStatement,
  decl: VariableDeclaration,
  startLine: number,
  endLine: number,
  startColumn: number,
  endColumn: number
): SymbolOutline {
  const name = decl.getName();
  const isExported = stmt.isExported();
  const isDefaultExport = stmt.isDefaultExport();
  const declKind = stmt.getDeclarationKind();
  const init = decl.getInitializer();

  let kind: SymbolKind = 'variable';
  let signature = `${isExported ? 'export ' : ''}${declKind} ${name}`;

  if (init && Node.isArrowFunction(init)) {
    kind = 'arrow_function';
    const params = init.getParameters().map((p) => p.getText()).join(', ');
    const returnType = init.getReturnTypeNode()?.getText() || init.getReturnType().getText(init);
    const isAsync = init.isAsync() ? 'async ' : '';
    signature = `${isExported ? 'export ' : ''}${declKind} ${name} = ${isAsync}(${params}): ${returnType} => ...`;
  } else if (decl.getTypeNode()) {
    signature = `${isExported ? 'export ' : ''}${declKind} ${name}: ${decl.getTypeNode()?.getText()}`;
  } else {
    const typeText = decl.getType().getText(decl);
    const shortType = typeText.length > 50 ? `${typeText.slice(0, 47)}...` : typeText;
    signature = `${isExported ? 'export ' : ''}${declKind} ${name}: ${shortType}`;
  }

  const docComment = stmt.getJsDocs().map((d) => d.getCommentText() || '').join('\n') || undefined;

  return {
    name,
    kind,
    isExported,
    isDefaultExport,
    startLine,
    endLine,
    startColumn,
    endColumn,
    signature,
    docComment,
  };
}
