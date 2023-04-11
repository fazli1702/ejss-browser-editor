import React, { Component } from "react";
import _ from "lodash";
import { Input, Button, Alert, Modal, Tabs } from "antd";
import { saveAs } from "file-saver";
import {
  EDITABLE_VARIABLES_REGEX,
  EDITABLE_FUNCTIONS_REGEX,
} from "../utils/constants";
import iconv from "iconv-lite";
import { comment } from "jszip/lib/defaults";
const { TabPane } = Tabs;

export default class Editor extends Component {
  // TODO: spin this out into a route /editor/{simId}
  constructor(props) {
    super();
    this.state = this.setModalMeta(props.doc, props.ejssFile);
  }

  onChange = (e) => {
    const input = e.target.name.split("_");
    const type = input[0]; // functions / variables
    const name = input[1]; // functionName / variableName
    const currentTypeState = this.state[type];
    currentTypeState[name] = e.target.value; // note: do not mutate state directly
    this.setState(
      {
        [type]: currentTypeState,
      },
      () => console.log(this.state[type])
    );
  };

  onSave = () => {
    // retrieve doc
    const { variables, functions } = this.state;
    var doc = this.state.doc;
    var xDoc = this.readXML();

    const variableNames = Object.keys(variables);
    const functionNames = Object.keys(functions);

    for (var i = 0; i < variableNames.length; i++) {
      const varName = variableNames[i];
      const value = variables[varName];
      // console.log(varName, value)
      if (!_.isUndefined(value)) {
        // search and replace
        // xhtml / html
        // console.log(
        //   `${EDITABLE_VARIABLES_REGEX.replace("[a-zA-Z0-9]+", varName)}`
        // );
        var re = new RegExp(
          `${EDITABLE_VARIABLES_REGEX.replace("[a-zA-Z0-9]+", varName)}`
        ); // regex to search for variable name to be replaced in xhtml
        var res = doc.replace(re, `$1${value}$3$4`);
        doc = res;

        // ejss / xml file
        var variableTags = xDoc.getElementsByTagName("Variable");

        for (let j = 0; j < variableTags.length; j++) {
          let variableTag = variableTags[j];
          let variableName = variableTag.firstElementChild.childNodes[0].nodeValue;
          if (variableName == varName) {
            let x = variableTag.children;
            for (let k = 0; k < x.length; k++) {
              let child = x[k];
              if (child.nodeName == "Value") {
                // update value
                // console.log(`before: ${xDoc.getElementsByTagName("Variable")[j].children[k].childNodes[0].nodeValue}`);
                // console.log(xDoc.getElementsByTagName("Variable")[j].children[k].childNodes[0].nodeValue);
                // console.log(xDoc.getElementsByTagName("Variable")[j].children[k].childNodes[0]);
                xDoc.getElementsByTagName("Variable")[j].children[k].childNodes[0].nodeValue = value;
                // console.log(`after: ${xDoc.getElementsByTagName("Variable")[j].children[k].childNodes[0].nodeValue}`);
              }
            }
          }
          

          // Check name
          // let nameTags = variableTag.getElementsByTagName("Name");
          // if (nameTags.length < 1) continue;
          // let nameTag = nameTags[0];
          // if (nameTag.textContent == varName) {
          //   let valueTags = variableTag.getElementsByTagName("Value");
          //   if (valueTags.length < 1) continue;
          //   let valueTag = valueTags[0];
          //   console.log(`${nameTag.textContent} = ${valueTag.textContent}`);
          //   console.log(variableTag);
          //   xDoc.getElementsByTagName("Variable")[j].childNodes
          // }
        }
      }
    }

    for (var i = 0; i < functionNames.length; i++) {
      const funcName = functionNames[i];
      const value = functions[funcName];
      if (!_.isUndefined(value)) {
        // search and replace
        var re = new RegExp(
          `${EDITABLE_FUNCTIONS_REGEX.replace(`[a-zA-Z]+`, funcName)}`
        ); // regex to search for function name to be replaced in xhtml
        let formattedString =
          "  " +
          JSON.stringify(value)
            .replace(/\\n/g, "\n ")
            .slice(1, -1)
            .replace(/\\"/g, '"');

        var res = doc.replace(re, `function $1$2${formattedString}\n$4`);
        doc = res;

        // ejss / xml file
        var functionTags = xDoc.getElementsByTagName("Osejs.Model.Library.Page");
        // console.log(functionTags);
        for (let j = 0; j < functionTags.length; j++) {
          let functionTag = functionTags[j];
          let functionName = functionTag.getElementsByTagName("Name")[0].textContent;
          if (functionName == "EditableFunction") {
            let content = functionTag.lastElementChild;
            let k = functionTag.children.length;

            let code = content.lastElementChild;
            let x = content.children.length;

            let functionText = xDoc.getElementsByTagName("Osejs.Model.Library.Page")[j].children[k-1].children[x-1].textContent;
            
            // add function name and curly bracket at start and end of function
            let formatFunction = "";
            for (let y = 0; y < functionText.length; y++) {
              if (functionText[y] == "{") {
                formatFunction += functionText[y] + "\n";
                break;
              }
              formatFunction += functionText[y];
            }
            formatFunction += value + "}";

            // console.log(functionText);
            // console.log(formatFunction);
            
            // console.log("before");
            // console.log(xDoc.getElementsByTagName("Osejs.Model.Library.Page")[j].children[k-1].children[x-1].textContent);

            xDoc.getElementsByTagName("Osejs.Model.Library.Page")[j].children[k-1].children[x-1].textContent = formatFunction;

            // console.log("after");
            // console.log(xDoc.getElementsByTagName("Osejs.Model.Library.Page")[j].children[k-1].children[x-1].textContent);
          }
        }
      }
    }
    // console.log(xDoc);

    this.setState({
      isSaved: true,
      doc: doc,
      xDoc: xDoc,
    });
  };

  onOkEditor = () => {
    // this function replaces xhtml / index in zip file and preps for download
    const { doc } = this.state;
    const { zip, folderName } = this.props;

    const docBlob = new Blob([doc]);

    // just generate index.html - weehee, update old sims!
    zip.file(`index.html`, docBlob);

    // find name of file
    try {
      const name = zip.file(/^(\S+_Simulation\.xhtml)$/)[0].name;
      // rewrite Sim file
      zip.file(name, docBlob);
    } catch {
      // might not exist, grab name from ejss file.
      const name = zip.file(/^(\S+\.ejss)$/)[0].name;
      zip.file(`${name.split(".")[0]}_Simulation.xhtml`, docBlob);
    }

    zip.generateAsync({ type: "blob" }).then((blob) => {
      saveAs(blob, `${folderName}`);
    });
  };

  setModalMeta(doc, ejssFile) {
    if (!_.isNull(doc)) {
      // parse html
      var title = doc.match(/<title>(.*?)<\/title>/)[1] || "undefined title";

      // look for variables
      var re = new RegExp(`${EDITABLE_VARIABLES_REGEX}`, "gm");

      var match,
        variables = {};

      // find variables and update state
      while ((match = re.exec(doc))) {
        let name = match[4];
        let value = match[2];
        if (!Object.keys(variables).includes(match[4])) {
          variables[name] = value;
        }
      }

      var re = new RegExp(`${EDITABLE_FUNCTIONS_REGEX}`, "gm");

      var match,
        functions = {};

      // find variables and update state
      while ((match = re.exec(doc))) {
        let name = match[1];
        let value = match[3];
        if (!Object.keys(functions).includes(name)) {
          functions[name] = value;
        }
      }

      return {
        variables: variables,
        functions: functions,
        title: title,
        doc: doc,
        isSaved: false,
        ejssFile: ejssFile,
      };
    }
  }

  readXML = () => {
    var parser = new DOMParser();
    var xDoc = parser.parseFromString(
      iconv.decode(Buffer.from(this.state.ejssFile.slice(3)), "utf16"),
      "text/xml"
    );
    return xDoc;
  }

  findCommentInXML = (variable) => {
    var xDoc = this.readXML();
    var x = xDoc.getElementsByTagName("Variable");

    for (var i = 0; i < x.length; i++) {
      // console.log(x[i]);
      let variableName = x[i].firstElementChild.childNodes[0].nodeValue;
      if (variableName === variable) {
        let nodeName = x[i].lastElementChild.nodeName;

        if (nodeName == "Comment") {
          let comment = x[i].lastElementChild.childNodes[0].nodeValue;
          if (comment === "null") {
            return "";
          }
          return comment;
        }
      }
    }
  };

  render() {
    const { variables, isSaved, title, functions } = this.state;
    const { toggleEditor, showEditor } = this.props;
    const disabledSave = _.isEmpty(variables);
    const disabledDownload = isSaved === false;
    return (
      <Modal
        title="Edit Model"
        visible={showEditor}
        okButtonProps={{ disabled: disabledDownload }}
        onOk={this.onOkEditor}
        onCancel={toggleEditor}
        okText="Save model to your computer"
        style={{
          minWidth:`50vw`,   // width for entire edit model box
        }}
      >
        {isSaved ? (
          <Alert
            style={{
              marginBottom: 10,
            }}
            message="Model has been rewritten."
            type="success"
          />
        ) : null}
        <h2>{title}</h2>
        <Tabs
          defaultActiveKey="1"
          style={{
            maxHeight: 500,
            overflowY: `scroll`,
          }}
        >
          <TabPane tab="Variables" key="1">
            {variables && Object.keys(variables).length > 0 ? (
              Object.keys(variables).map((name, i) => {
                let value = variables[name];
                let comment = this.findCommentInXML(name);
                return (
                  <div
                    style={{
                      marginBottom: 20,
                    }}
                    key={i}
                  >
                    <b>
                      <code>{name}</code>
                    </b>
                    <br />
                    <i>{comment}</i>
                    <Input
                      name={`variables_${name}`}
                      placeholder={value}
                      value={value}
                      onChange={this.onChange}
                    />
                  </div>
                );
              })
            ) : (
              <div>No editable variables found. email weelookang@gmail.com to add this feature to your selected EJSS model. Basically, VariableTab must be rename to EditableVariable and function rename as EditableFunction.</div>
            )}
          </TabPane>
          <TabPane tab="Functions" key="2">
            {functions && Object.keys(functions).length > 0
              ? Object.keys(functions).map((name, i) => {
                  let value = functions[name];
                  return (
                    <div
                      style={{
                        marginBottom: 20,
                      }}
                      key={i}
                    >
                      <code>{`function ${name}() {`}</code>
                      <Input.TextArea
                        name={`functions_${name}`}
                        placeholder={value}
                        value={value}
                        onChange={this.onChange}
                        style={{
                          minHeight:`50vh`,
                        }}
                      />
                      <code>{`}`}</code>
                    </div>
                  );
                })
              : "No functions to customize"}
          </TabPane>
        </Tabs>
        <Button
          style={{
            marginTop: 10,
          }}
          disabled={disabledSave}
          onClick={this.onSave}
        >
          Save your edits
        </Button>
      </Modal>
    );
  }
}
