import re
import os
import shutil
import yaml

OBSIDIAN_VAULT_PATH = '/Users/di3go/Library/Mobile Documents/iCloud~md~obsidian/Documents/vault/'
ASTRO_CONTENT_PATH = '/Users/di3go/Projects/blog-astro/src/content'
OBSIDIAN_PAGES_PATH = f"{OBSIDIAN_VAULT_PATH}/Pages"
OBSIDIAN_ASSETS_PATH = f"{OBSIDIAN_VAULT_PATH}/Assets"
FOLDERS_MAPPING = {
    f"{OBSIDIAN_PAGES_PATH}/Blog/Articles": f"{ASTRO_CONTENT_PATH}/articles",
    f"{OBSIDIAN_PAGES_PATH}/Blog/Writeups": f"{ASTRO_CONTENT_PATH}/writeups"
}

def list_documents(path):
    return [f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))]

if __name__ == "__main__":

    for source_folder_path, target_folder_path in FOLDERS_MAPPING.items():

        # Remove the target path if it exists
        if os.path.exists(target_folder_path):
            shutil.rmtree(target_folder_path)

        # Re-create the target path
        os.makedirs(target_folder_path)

        for full_filename in list_documents(source_folder_path):
            filename, extension = os.path.splitext(full_filename)
            target_dirname = filename.lower().replace(' ', '-')

            source_filepath = \
                os.path.join(source_folder_path, full_filename)
            target_dirpath = \
                os.path.join(target_folder_path, target_dirname)
            target_filepath = \
                os.path.join(target_folder_path, target_dirname, 'index.md')

            # Create the target file path
            os.makedirs(target_dirpath)

            with open(source_filepath, 'r') as source_file:

                file_content = source_file.read()

                file_frontmatter_yaml_match = re.search(r'^---\n(.*?)\n---', file_content, re.DOTALL)
                if file_frontmatter_yaml_match:
                    file_frontmatter = yaml.safe_load(file_frontmatter_yaml_match.group(1))
                    new_file_frontmatter = {}
                    new_file_frontmatter['title'] = filename
                    new_file_frontmatter['published'] = file_frontmatter['Created']
                    if 'CTF' in file_frontmatter:
                        new_file_frontmatter['ctf'] = file_frontmatter['CTF']
                    if 'Tags' in file_frontmatter:
                        new_file_frontmatter['tags'] = [f.replace('#', '') for f in file_frontmatter['Tags']]
                    if 'tags' in file_frontmatter:
                        new_file_frontmatter['tags'] = [f.replace('#', '') for f in file_frontmatter['tags']]


                    new_file_frontmatter_yaml = f"---\n{yaml.dump(new_file_frontmatter)}\n---\n"
                    file_content = file_content.replace(file_frontmatter_yaml_match.group(0), new_file_frontmatter_yaml,1)

                else:
                    raise ValueError(f"Frontmatter not found in {source_filepath}")

                attachment_matches = re.finditer(r'[!]\[\[(.*?)([|](.*?))?\]\]', file_content)
                for attachment_match in attachment_matches:
                    attachment_name = attachment_match.group(1)
                    source_attachment_path = os.path.join(OBSIDIAN_ASSETS_PATH, attachment_name)
                    target_attachment_path = os.path.join(target_dirpath, attachment_name)
                    shutil.copyfile(source_attachment_path, target_attachment_path)

                    file_content = file_content.replace(attachment_match.group(0), f'![{attachment_name}](./{attachment_name})')

                with open(target_filepath, 'w') as target_file:
                    target_file.write(file_content)
