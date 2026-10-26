# KaffeeBlock

Learn Java by snapping blocks together.

KaffeeBlock is for people who have never written a line of code, or who tried once and bounced off a wall of semicolons. You build a program out of colored blocks, press **Run**, and watch it work. Next to your blocks, the matching Java code writes itself, line by line. When you are ready, one click saves it as a real `.java` file that compiles and runs anywhere Java does.

It runs entirely in your browser. No account, no install, nothing sent anywhere. Your work is kept on your own machine.

## What you can do with it

- **Build programs with blocks.** Variables, if/else, loops, math, text, arrays, and asking the user for input. Enough to solve classic problems like FizzBuzz, averages, finding the highest score in a list, number guessing games and simple calculators.
- **Work with arrays.** Create `int[]`, `double[]`, `String[]` and `boolean[]` arrays from a list of values or by size, read and change items by position, loop over them with *for each*, and print them as `[4, 8, 15]`. Going past the end throws the same `ArrayIndexOutOfBoundsException` Java does.
- **Run them instantly.** Output shows up in the console as it happens. If the program asks a question, you type the answer right there. Stuck in an endless loop? Press **Stop**.
- **See the real Java.** Every block you drop updates the Java code on the right, formatted the way a person would write it.
- **Learn Java's rules early.** KaffeeBlock checks your program the way the Java compiler does. Using a variable before creating it, putting `2.5` into an `int`, or writing code that can never run is flagged on the block itself, with a plain-language explanation.
- **Get the same answers Java gives.** `7 / 2` is `3`, `1.0` prints as `1.0`, and dividing an int by zero throws an `ArithmeticException`, exactly like the real thing.
- **Export with one click.** **Export .java** gives you a file ready for `javac`, an IDE, or a class assignment.
- **English and Spanish.** Switch with the EN / ES toggle at the top. The whole interface, including the blocks, changes language and your program stays put.
- **Save and open projects.** Projects are small `.kblock` files you can keep, email or share.

## Try it

Open the web version: https://wellm3id08.github.io/kaffeeblock/

Or download the desktop app for Windows or Linux from the [Releases](../../releases) page. Unzip it and run `kaffeeblock-win_x64.exe` (Windows) or `kaffeeblock-linux_x64` (Linux). Keep `resources.neu` in the same folder as the program.

On Linux the desktop app uses the system web view. If it does not start, install it with `sudo apt install libwebkit2gtk-4.1-0` (Debian/Ubuntu) or your distribution's equivalent.

## Your first program

1. The brown **program** block is where everything starts. Only blocks inside it run.
2. Open **Variables**, press **New variable**, call it `age`.
3. Drag **new int age = 0** into the program block.
4. From **Program**, drag **print line** below it and drop the `age` block into its slot.
5. Press **Run**. The console prints `0`, and the Java panel shows exactly what you built:

```java
public class Main {

    public static void main(String[] args) {
        int age = 0;
        System.out.println(age);
    }
}
```

The **Examples** menu has a few complete programs to pull apart and change.

## Keyboard

- `Ctrl` + `Enter` (or `Cmd` + `Enter`) runs or stops the program.
- `Ctrl` + `Z` undoes the last block change.

## Running it yourself

There is no build step. The app is plain HTML, CSS and JavaScript in the `app` folder, with Blockly bundled in `app/vendor`.

Serve the folder with any static server and open it:

```sh
npx serve app
```

Opening `app/index.html` straight from disk also works in most browsers.

## Publishing

**GitHub Pages.** Push to `main`. The `Pages` workflow publishes the `app` folder. In the repository settings, under *Pages*, set the source to *GitHub Actions* once. If Pages is set to *Deploy from a branch* instead, it still works: the `index.html` at the root of the repository forwards visitors to `app/`.

The `.github` folder holds both workflows. Uploading files through the GitHub website skips folders whose names start with a dot, so push with git (or create the workflow files by hand on GitHub) to make sure it is there.

**Desktop releases.** Push a version tag:

```sh
git tag v1.0.0
git push origin v1.0.0
```

The `Release` workflow wraps the same web app in a small native window using [Neutralinojs](https://neutralino.js.org), builds the Windows and Linux bundles, and attaches them to a GitHub release. You can also start it by hand from the *Actions* tab; the bundles then appear as a downloadable artifact on that run.

## How it is put together

```
app/
  index.html         page layout
  css/style.css      look and feel, light and dark
  js/i18n.js         English and Spanish text
  js/blocks.js       the KaffeeBlock blocks, colors and toolbox
  js/compiler.js     turns blocks into Java and into the code the preview runs
  js/runtime.js      Java behavior in the browser: int math, number printing, arrays, input, exceptions
  js/examples.js     the programs in the Examples menu
  js/app.js          wiring: workspace, console, saving, language
  vendor/            Blockly and the Neutralinojs client
neutralino.config.json   desktop app settings
```

The preview does not run Java in the browser. The compiler produces two programs from the same blocks, Java for you to read and export, and JavaScript for the Run button, and the runtime is careful to make the second behave like the first.

## Credits

Built on [Blockly](https://developers.google.com/blockly) (Apache 2.0) and [Neutralinojs](https://neutralino.js.org) (MIT). See `app/vendor/NOTICE.md`.

## License

MIT. See [LICENSE](LICENSE). Blockly and Neutralinojs keep their own licenses, listed in `app/vendor/NOTICE.md`.
