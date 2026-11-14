/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Only this bundled script is executed. Tool parameters never become Java source.
export const ghidraDecompileScript = `
import ghidra.app.util.headless.HeadlessScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import com.google.gson.Gson;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public class UltraDecompile extends HeadlessScript {
  public void run() throws Exception {
    String[] args = getScriptArgs();
    if (analysisTimeoutOccurred()) throw new IllegalStateException("Ghidra auto-analysis timed out; no complete result is claimed.");
    Function function = null;
    String selection = "requested-address";
    if (!args[1].equals("entry")) {
      Address address = currentProgram.getAddressFactory().getAddress(args[1]);
      if (address != null) function = currentProgram.getFunctionManager().getFunctionContaining(address);
    } else {
      selection = "first-entrypoint-or-function";
      var entries = currentProgram.getSymbolTable().getExternalEntryPointIterator();
      while (entries.hasNext() && function == null) {
        function = currentProgram.getFunctionManager().getFunctionAt(entries.next());
      }
      if (function == null) {
        var functions = currentProgram.getFunctionManager().getFunctions(true);
        if (functions.hasNext()) function = functions.next();
      }
    }
    if (function == null || function.isExternal()) throw new IllegalStateException("No local function at the selected address. Ghidra image base: " + currentProgram.getImageBase() + ". PIE/shared libraries may be rebased; omit address to inspect an entrypoint, then use Ghidra virtual addresses.");
    DecompInterface decompiler = new DecompInterface();
    try {
      if (!decompiler.openProgram(currentProgram)) throw new IllegalStateException("Ghidra decompiler could not open the program.");
      DecompileResults result = decompiler.decompileFunction(function, 30, monitor);
      if (!result.decompileCompleted() || result.getDecompiledFunction() == null) throw new IllegalStateException("Function decompilation did not complete: " + result.getErrorMessage());
      String code = result.getDecompiledFunction().getC();
      if (code.length() == 0 || code.length() > 1048576) throw new IllegalStateException("Decompiled function is empty or exceeds the 1 MiB artifact limit.");
      Map<String, Object> report = new LinkedHashMap<>();
      report.put("completed", true);
      report.put("analysisTimedOut", false);
      report.put("functionName", function.getName());
      report.put("address", function.getEntryPoint().toString());
      report.put("imageBase", currentProgram.getImageBase().toString());
      report.put("language", currentProgram.getLanguageID().toString());
      report.put("compiler", currentProgram.getCompilerSpec().getCompilerSpecID().toString());
      report.put("signature", function.getSignature().toString());
      String inferredSignature = result.getDecompiledFunction().getSignature();
      if (inferredSignature != null && !inferredSignature.isBlank()) report.put("decompiledSignature", inferredSignature);
      report.put("selection", selection);
      report.put("code", code);
      report.put("diagnostics", result.getErrorMessage());
      try (var writer = Files.newBufferedWriter(Path.of(args[0]), StandardCharsets.UTF_8)) {
        new Gson().toJson(report, writer);
      }
    } finally {
      decompiler.dispose();
    }
  }
}
`;
