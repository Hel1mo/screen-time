UUID = screentime@helimo
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: install uninstall

install:
	@echo "Installing Screen Time..."
	mkdir -p "$(EXTENSION_DIR)"
	cp extension.js metadata.json prefs.js stylesheet.css "$(EXTENSION_DIR)/"
	mkdir -p "$(EXTENSION_DIR)/schemas"
	cp schemas/*.gschema.xml "$(EXTENSION_DIR)/schemas/"
	glib-compile-schemas "$(EXTENSION_DIR)/schemas/"
	gnome-extensions enable "$(UUID)"
	@echo "Screen Time installed and enabled!"

uninstall:
	@echo "Uninstalling Screen Time..."
	gnome-extensions disable "$(UUID)" || true
	rm -rf "$(EXTENSION_DIR)"
	@echo "Screen Time uninstalled!"
