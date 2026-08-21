let familyData = JSON.parse(localStorage.getItem('familyTree')) || [];
let nextId = familyData.length > 0 ? Math.max(...familyData.map(m => m.id)) + 1 : 1;

const form = document.getElementById('member-form');
const parentSelect = document.getElementById('parent-id');
const treeContainer = document.getElementById('tree-container');

function saveData() {
    localStorage.setItem('familyTree', JSON.stringify(familyData));
}

function updateSelect() {
    parentSelect.innerHTML = '<option value="">-- Select Parent (Leave blank for Root) --</option>';
    familyData.forEach(member => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.name;
        parentSelect.appendChild(option);
    });
}

function renderTree() {
    treeContainer.innerHTML = '';
    if (familyData.length === 0) return;

    // Find roots (members without parent or whose parent is missing)
    const roots = familyData.filter(m => !m.parentId || !familyData.some(p => p.id === m.parentId));
    
    if (roots.length > 0) {
        const ul = document.createElement('ul');
        roots.forEach(root => {
            ul.appendChild(buildNode(root));
        });
        treeContainer.appendChild(ul);
    }
}

function buildNode(member) {
    const li = document.createElement('li');
    
    const card = document.createElement('div');
    card.className = 'member-card';
    card.innerHTML = `
        <strong>${member.name}</strong>
        ${member.relation ? `<br><em style="color: #666; font-size: 0.9em;">${member.relation}</em>` : ''}
        ${member.dob ? `<br><small>${member.dob}</small>` : ''}
        <button class="delete-btn" onclick="deleteMember(${member.id})" title="Delete member">X</button>
    `;
    li.appendChild(card);

    const children = familyData.filter(m => m.parentId === member.id);
    if (children.length > 0) {
        const childUl = document.createElement('ul');
        children.forEach(child => {
            childUl.appendChild(buildNode(child));
        });
        li.appendChild(childUl);
    }

    return li;
}

form.addEventListener('submit', function(e) {
    e.preventDefault();
    const name = document.getElementById('name').value;
    const relation = document.getElementById('relation').value;
    const dob = document.getElementById('dob').value;
    const parentId = parentSelect.value;

    const newMember = {
        id: nextId++,
        name,
        relation,
        dob,
        parentId: parentId ? parseInt(parentId) : null
    };

    familyData.push(newMember);
    saveData();
    updateSelect();
    renderTree();
    form.reset();
});

window.deleteMember = function(id) {
    if (confirm("Are you sure you want to delete this member? All descendants will also be removed.")) {
        const idsToRemove = new Set([id]);
        
        // Find all descendants
        let added = true;
        while(added) {
            added = false;
            familyData.forEach(m => {
                if (idsToRemove.has(m.parentId) && !idsToRemove.has(m.id)) {
                    idsToRemove.add(m.id);
                    added = true;
                }
            });
        }

        familyData = familyData.filter(m => !idsToRemove.has(m.id));
        saveData();
        updateSelect();
        renderTree();
    }
};

document.getElementById('clear-tree').addEventListener('click', () => {
    if(confirm("Clear entire family tree?")) {
        familyData = [];
        saveData();
        updateSelect();
        renderTree();
    }
});

// Initial Render
updateSelect();
renderTree();
